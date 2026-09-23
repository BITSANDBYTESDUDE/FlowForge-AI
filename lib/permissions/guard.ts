import { Types } from 'mongoose';
import { Membership, Workspace } from '@/models';
import { ForbiddenError, NotFoundError } from '@/lib/utils/errors';
import { roleHasPermission, type Permission } from '@/lib/permissions';
import type { WorkspaceRole } from '@/types/workspace';

export type WorkspaceContext = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  workspaceName: string;
};

/** Rejects anything that is not a well-formed Mongo ObjectId before it reaches a query. */
export function assertObjectId(value: string, label = 'id'): string {
  if (!Types.ObjectId.isValid(value)) {
    throw new NotFoundError(label === 'id' ? 'Resource' : label);
  }
  return value;
}

export function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(assertObjectId(value));
}

/**
 * Resolves the caller's membership in a workspace, or throws.
 *
 * This is the single choke point for tenant isolation: `workspaceId` always
 * originates from the request, so it is never trusted — membership is looked up
 * from the database using the *authenticated* user id. A client that guesses
 * another workspace's id gets a 403, not data.
 */
export async function requireMembership(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceContext> {
  assertObjectId(workspaceId, 'workspaceId');

  const membership = await Membership.findOne({
    workspaceId: new Types.ObjectId(workspaceId),
    userId: new Types.ObjectId(assertObjectId(userId, 'userId')),
  }).lean();

  if (!membership) {
    // Distinguish "does not exist" from "not a member" only when the workspace
    // is genuinely absent; otherwise a probe could enumerate workspace ids.
    const exists = await Workspace.exists({ _id: new Types.ObjectId(workspaceId) });
    if (!exists) throw new NotFoundError('Workspace');
    throw new ForbiddenError('You are not a member of this workspace');
  }

  const workspace = await Workspace.findById(workspaceId).select('name').lean();
  if (!workspace) throw new NotFoundError('Workspace');

  return {
    userId,
    workspaceId,
    role: membership.role,
    workspaceName: workspace.name,
  };
}

/** Membership lookup that returns `null` instead of throwing (list endpoints). */
export async function getMembership(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceContext | null> {
  if (!Types.ObjectId.isValid(workspaceId) || !Types.ObjectId.isValid(userId)) return null;

  const membership = await Membership.findOne({
    workspaceId: new Types.ObjectId(workspaceId),
    userId: new Types.ObjectId(userId),
  }).lean();
  if (!membership) return null;

  const workspace = await Workspace.findById(workspaceId).select('name').lean();
  if (!workspace) return null;

  return { userId, workspaceId, role: membership.role, workspaceName: workspace.name };
}

/**
 * Authorizes a permission within a workspace.
 *
 * Order matters: authenticate → resolve membership → check permission →
 * (caller then loads the resource). Resource lookups always include the
 * workspace id in their filter, so a valid membership can never reach a
 * different tenant's document.
 */
export async function requirePermission(
  userId: string,
  workspaceId: string,
  permission: Permission,
): Promise<WorkspaceContext> {
  const context = await requireMembership(userId, workspaceId);
  if (!roleHasPermission(context.role, permission)) {
    throw new ForbiddenError(`Your role (${context.role}) cannot perform this action`);
  }
  return context;
}

/** Workspace ids the user belongs to, with roles. Used for tenant-scoped listing. */
export async function listUserWorkspaceIds(userId: string): Promise<string[]> {
  const memberships = await Membership.find({ userId: new Types.ObjectId(userId) })
    .select('workspaceId')
    .lean();
  return memberships.map((m) => m.workspaceId.toString());
}
