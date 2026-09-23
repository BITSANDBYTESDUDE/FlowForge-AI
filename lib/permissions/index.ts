import { ROLE_RANK, type WorkspaceRole } from '@/types/workspace';

/**
 * Central authorization policy.
 *
 * Permissions are declared as data so the API guards, the UI (to hide actions a
 * role cannot perform) and the unit tests all read from one source of truth.
 * Adding a capability means adding a key here, not hunting for `role ===`
 * comparisons across the codebase.
 */
export const PERMISSIONS = [
  'workspace:read',
  'workspace:update',
  'workspace:delete',
  'member:invite',
  'member:remove',
  'member:update_role',
  'workflow:read',
  'workflow:create',
  'workflow:update',
  'workflow:delete',
  'workflow:execute',
  'task:read',
  'task:create',
  'task:update',
  'task:delete',
  'task:assign',
  'template:read',
  'template:create',
  'template:apply',
  'analytics:read',
  'audit:read',
  'ai:use',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role → permission matrix.
 *
 * VIEWER is read-only. MEMBER can do the work (workflows, tasks, AI, execution)
 * but cannot restructure the workspace or its people. ADMIN is everything except
 * destroying the workspace itself, which stays with OWNER.
 */
const VIEWER_PERMISSIONS: Permission[] = [
  'workspace:read',
  'workflow:read',
  'task:read',
  'template:read',
  'analytics:read',
];

const MEMBER_PERMISSIONS: Permission[] = [
  ...VIEWER_PERMISSIONS,
  'workflow:create',
  'workflow:update',
  'workflow:execute',
  'task:create',
  'task:update',
  'task:assign',
  'template:create',
  'template:apply',
  'ai:use',
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...MEMBER_PERMISSIONS,
  'workspace:update',
  'member:invite',
  'member:remove',
  'member:update_role',
  'workflow:delete',
  'task:delete',
  'audit:read',
];

const OWNER_PERMISSIONS: Permission[] = [...ADMIN_PERMISSIONS, 'workspace:delete'];

export const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  VIEWER: VIEWER_PERMISSIONS,
  MEMBER: MEMBER_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  OWNER: OWNER_PERMISSIONS,
};

export function roleHasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** True when `role` is at least as privileged as `minimum`. */
export function roleAtLeast(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * Guard for role changes.
 *
 * Two rules protect the workspace from lockout: nobody may promote a member to
 * a role above their own, and the OWNER role is not assignable through the
 * member API (ownership transfer is a deliberate, separate flow).
 */
export function canAssignRole(actorRole: WorkspaceRole, nextRole: WorkspaceRole): boolean {
  if (nextRole === 'OWNER') return false;
  return ROLE_RANK[actorRole] > ROLE_RANK[nextRole];
}

/** The workspace must always retain at least one owner. */
export function canRemoveMember(actorRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
  if (targetRole === 'OWNER') return false;
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole];
}

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  OWNER: 'Full control, including deleting the workspace.',
  ADMIN: 'Manage members, workflows, tasks and workspace settings.',
  MEMBER: 'Create and edit workflows, tasks and run executions.',
  VIEWER: 'Read-only access to workflows, tasks and analytics.',
};
