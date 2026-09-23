import { Types } from 'mongoose';
import { Membership, User, Workspace } from '@/models';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/utils/errors';
import { canAssignRole, canRemoveMember, roleAtLeast } from '@/lib/permissions';
import { assertObjectId, listUserWorkspaceIds, requirePermission } from '@/lib/permissions/guard';
import { recordActivity } from '@/lib/notifications';
import { recordAudit } from '@/lib/audit';
import { slugify } from '@/lib/utils/slugify';
import type { CreateWorkspaceInput, InviteMemberInput, UpdateWorkspaceInput } from '@/schemas/workspace.schema';
import type { MembershipSummary, WorkspaceDetail, WorkspaceRole, WorkspaceSummary } from '@/types/workspace';

/**
 * Workspace service.
 *
 * Owns workspace lifecycle and membership. Every mutation resolves the caller's
 * role through the central guard before touching data; ownership rules that
 * protect against lockout (last owner, role escalation) live here.
 */

function toSummary(
  workspace: { _id: Types.ObjectId; name: string; slug: string; ownerId: Types.ObjectId; logo: string | null; plan: 'FREE' | 'PRO' | 'TEAM'; createdAt: Date; updatedAt: Date },
  role: WorkspaceRole,
): WorkspaceSummary {
  return {
    id: workspace._id.toString(),
    name: workspace.name,
    slug: workspace.slug,
    ownerId: workspace.ownerId.toString(),
    logo: workspace.logo,
    plan: workspace.plan,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    role,
  };
}

/** Ensures slug uniqueness by suffixing, rather than failing the user's first action. */
async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'workspace';
  let candidate = root;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const exists = await Workspace.exists({ slug: candidate });
    if (!exists) return candidate;
    candidate = `${root}-${Math.random().toString(36).slice(2, 7)}`;
  }
  throw new ConflictError('Could not allocate a unique workspace slug');
}

export async function createWorkspace(
  userId: string,
  input: CreateWorkspaceInput,
): Promise<WorkspaceSummary> {
  const slug = input.slug ?? (await uniqueSlug(input.name));

  if (input.slug) {
    const taken = await Workspace.exists({ slug: input.slug });
    if (taken) throw new ConflictError('That workspace URL is already taken');
  }

  const workspace = await Workspace.create({
    name: input.name,
    slug,
    ownerId: new Types.ObjectId(assertObjectId(userId, 'userId')),
    logo: input.logo ?? null,
    settings: { defaultWorkflowStatus: 'DRAFT', allowGuestViewers: false, aiEnabled: true },
  });

  // The creator is always the OWNER; creating the workspace and its ownership
  // row together is what makes the workspace reachable through listWorkspaces.
  await Membership.create({
    workspaceId: workspace._id,
    userId: new Types.ObjectId(userId),
    role: 'OWNER',
    permissions: [],
  });

  await recordAudit({
    workspaceId: workspace._id,
    actorId: userId,
    action: 'WORKSPACE_CREATED',
    entityType: 'WORKSPACE',
    entityId: workspace._id,
    metadata: { name: workspace.name },
  });

  await recordActivity({
    workspaceId: workspace._id,
    userId,
    action: 'WORKSPACE_UPDATED',
    entityType: 'WORKSPACE',
    entityId: workspace._id,
    metadata: { created: true },
  });

  return toSummary(workspace, 'OWNER');
}

export async function listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const memberships = await Membership.find({ userId: new Types.ObjectId(assertObjectId(userId, 'userId')) })
    .sort({ createdAt: 1 })
    .lean();

  if (memberships.length === 0) return [];

  const workspaces = await Workspace.find({
    _id: { $in: memberships.map((m) => m.workspaceId) },
  }).lean();

  const roleByWorkspace = new Map(memberships.map((m) => [m.workspaceId.toString(), m.role]));

  return workspaces
    .map((workspace) => toSummary(workspace, roleByWorkspace.get(workspace._id.toString()) ?? 'VIEWER'))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getWorkspace(userId: string, workspaceId: string): Promise<WorkspaceDetail> {
  const context = await requirePermission(userId, workspaceId, 'workspace:read');

  const workspace = await Workspace.findById(assertObjectId(workspaceId, 'workspaceId')).lean();
  if (!workspace) throw new NotFoundError('Workspace');

  const memberCount = await Membership.countDocuments({ workspaceId: workspace._id });

  return {
    ...toSummary(workspace, context.role),
    settings: workspace.settings,
    memberCount,
  };
}

export async function updateWorkspace(
  userId: string,
  workspaceId: string,
  input: UpdateWorkspaceInput,
): Promise<WorkspaceDetail> {
  await requirePermission(userId, workspaceId, 'workspace:update');

  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.logo !== undefined) update.logo = input.logo;
  if (input.settings) {
    for (const [key, value] of Object.entries(input.settings)) {
      if (value !== undefined) update[`settings.${key}`] = value;
    }
  }

  const workspace = await Workspace.findByIdAndUpdate(workspaceId, { $set: update }, { new: true }).lean();
  if (!workspace) throw new NotFoundError('Workspace');

  await recordActivity({
    workspaceId,
    userId,
    action: 'WORKSPACE_UPDATED',
    entityType: 'WORKSPACE',
    entityId: workspaceId,
    metadata: { fields: Object.keys(update) },
  });

  const memberCount = await Membership.countDocuments({ workspaceId: workspace._id });
  const membership = await Membership.findOne({
    workspaceId: workspace._id,
    userId: new Types.ObjectId(userId),
  }).lean();

  return {
    ...toSummary(workspace, membership?.role ?? 'VIEWER'),
    settings: workspace.settings,
    memberCount,
  };
}

export async function deleteWorkspace(userId: string, workspaceId: string): Promise<void> {
  await requirePermission(userId, workspaceId, 'workspace:delete');
  assertObjectId(workspaceId, 'workspaceId');

  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace) throw new NotFoundError('Workspace');

  // Cascading deletes live here rather than in model hooks so the ordering is
  // explicit and auditable.
  const { Workflow, Task, WorkflowVersion, WorkflowExecution, Notification, Activity, AuditLog } =
    await import('@/models');

  await Promise.all([
    Workflow.deleteMany({ workspaceId }),
    Task.deleteMany({ workspaceId }),
    WorkflowVersion.deleteMany({ workspaceId }),
    WorkflowExecution.deleteMany({ workspaceId }),
    Notification.deleteMany({ workspaceId }),
    Membership.deleteMany({ workspaceId }),
  ]);

  // Audit rows are retained deliberately: the record that a workspace existed
  // and was deleted is exactly what an audit trail is for. Activity is scoped to
  // the workspace and goes with it.
  await Activity.deleteMany({ workspaceId });
  await Workspace.findByIdAndDelete(workspaceId);

  await recordAudit({
    workspaceId,
    actorId: userId,
    action: 'WORKSPACE_DELETED',
    entityType: 'WORKSPACE',
    entityId: workspaceId,
    metadata: { name: workspace.name, slug: workspace.slug },
  });

  void AuditLog;
}

export async function listMembers(userId: string, workspaceId: string): Promise<MembershipSummary[]> {
  await requirePermission(userId, workspaceId, 'workspace:read');

  const memberships = await Membership.find({ workspaceId: new Types.ObjectId(workspaceId) })
    .sort({ createdAt: 1 })
    .lean();

  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } })
    .select('name email image')
    .lean();
  const userById = new Map(users.map((u) => [u._id.toString(), u]));

  return memberships.map((membership) => {
    const user = userById.get(membership.userId.toString());
    return {
      id: membership._id.toString(),
      workspaceId: membership.workspaceId.toString(),
      userId: membership.userId.toString(),
      role: membership.role,
      createdAt: membership.createdAt.toISOString(),
      user: user
        ? {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            avatar: user.image ?? null,
          }
        : null,
    };
  });
}

/**
 * Adds an existing FlowForge user to a workspace.
 *
 * Invitation emails are out of scope, so the invitee must already have an
 * account — a silent no-op would leave the inviter believing an email was sent.
 */
export async function inviteMember(
  userId: string,
  workspaceId: string,
  input: InviteMemberInput,
): Promise<MembershipSummary> {
  const context = await requirePermission(userId, workspaceId, 'member:invite');

  if (!canAssignRole(context.role, input.role)) {
    throw new ForbiddenError(`You cannot grant the ${input.role} role`);
  }

  const invitee = await User.findOne({ email: input.email.toLowerCase().trim() }).lean();
  if (!invitee) {
    throw new NotFoundError('User with that email');
  }

  const existing = await Membership.findOne({ workspaceId, userId: invitee._id }).lean();
  if (existing) throw new ConflictError('That person is already a member of this workspace');

  const membership = await Membership.create({
    workspaceId: new Types.ObjectId(workspaceId),
    userId: invitee._id,
    role: input.role,
    permissions: [],
  });

  await Promise.all([
    recordActivity({
      workspaceId,
      userId,
      action: 'MEMBER_INVITED',
      entityType: 'MEMBER',
      entityId: invitee._id,
      metadata: { email: invitee.email, role: input.role },
    }),
    recordAudit({
      workspaceId,
      actorId: userId,
      action: 'MEMBER_INVITED',
      entityType: 'MEMBER',
      entityId: invitee._id,
      metadata: { email: invitee.email, role: input.role },
    }),
  ]);

  const { notifyMany } = await import('@/lib/notifications');
  await notifyMany([
    {
      userId: invitee._id,
      workspaceId,
      type: 'MEMBER_INVITED',
      title: `You were added to ${context.workspaceName}`,
      message: `${context.workspaceName} added you as ${input.role}.`,
      data: { workspaceId, role: input.role },
    },
  ]);

  return {
    id: membership._id.toString(),
    workspaceId,
    userId: invitee._id.toString(),
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
    user: {
      id: invitee._id.toString(),
      name: invitee.name,
      email: invitee.email,
      avatar: invitee.image ?? null,
    },
  };
}

export async function updateMemberRole(
  userId: string,
  workspaceId: string,
  memberId: string,
  role: WorkspaceRole,
): Promise<void> {
  const context = await requirePermission(userId, workspaceId, 'member:update_role');
  assertObjectId(memberId, 'memberId');

  const membership = await Membership.findById(memberId).lean();
  if (!membership || membership.workspaceId.toString() !== workspaceId) {
    throw new NotFoundError('Membership');
  }
  if (membership.role === 'OWNER') {
    throw new ForbiddenError('Ownership cannot be changed here');
  }
  if (!canAssignRole(context.role, role)) {
    throw new ForbiddenError(`You cannot grant the ${role} role`);
  }

  const previousRole = membership.role;
  await Membership.findByIdAndUpdate(memberId, { $set: { role } });

  await Promise.all([
    recordActivity({
      workspaceId,
      userId,
      action: 'MEMBER_ROLE_CHANGED',
      entityType: 'MEMBER',
      entityId: membership.userId,
      metadata: { from: previousRole, to: role },
    }),
    recordAudit({
      workspaceId,
      actorId: userId,
      action: 'ROLE_CHANGED',
      entityType: 'MEMBER',
      entityId: membership.userId,
      metadata: { from: previousRole, to: role },
    }),
  ]);
}

export async function removeMember(
  userId: string,
  workspaceId: string,
  memberId: string,
): Promise<void> {
  const context = await requirePermission(userId, workspaceId, 'member:remove');
  assertObjectId(memberId, 'memberId');

  const membership = await Membership.findById(memberId).lean();
  if (!membership || membership.workspaceId.toString() !== workspaceId) {
    throw new NotFoundError('Membership');
  }

  const isSelf = membership.userId.toString() === userId;
  if (!isSelf && !canRemoveMember(context.role, membership.role)) {
    throw new ForbiddenError('You cannot remove this member');
  }

  // A workspace with no owner becomes unrecoverable through the UI.
  if (membership.role === 'OWNER') {
    const ownerCount = await Membership.countDocuments({ workspaceId, role: 'OWNER' });
    if (ownerCount <= 1) {
      throw new ValidationError('A workspace must keep at least one owner');
    }
  }

  await Membership.findByIdAndDelete(memberId);

  await Promise.all([
    recordActivity({
      workspaceId,
      userId,
      action: 'MEMBER_REMOVED',
      entityType: 'MEMBER',
      entityId: membership.userId,
      metadata: { role: membership.role, self: isSelf },
    }),
    recordAudit({
      workspaceId,
      actorId: userId,
      action: 'MEMBER_REMOVED',
      entityType: 'MEMBER',
      entityId: membership.userId,
      metadata: { role: membership.role, self: isSelf },
    }),
  ]);
}

/** Resolves the caller's role for a workspace, or null when not a member. */
export async function getRole(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRole | null> {
  const ids = await listUserWorkspaceIds(userId);
  if (!ids.includes(workspaceId)) return null;
  const membership = await Membership.findOne({ workspaceId, userId }).select('role').lean();
  return membership?.role ?? null;
}

export { roleAtLeast };
