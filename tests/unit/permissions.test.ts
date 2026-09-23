import { describe, expect, it } from 'vitest';
import {
  canAssignRole,
  canRemoveMember,
  roleAtLeast,
  roleHasPermission,
} from '@/lib/permissions';
import { WORKSPACE_ROLES, type WorkspaceRole } from '@/types/workspace';

/**
 * Permission matrix tests.
 *
 * These assert the security properties that matter — a viewer cannot write, a
 * member cannot delete, nobody can escalate — rather than exhaustively listing
 * the matrix. Listing every cell would pass just as happily if a permission were
 * added to the wrong role.
 */
describe('roleHasPermission', () => {
  it('gives viewers read-only access', () => {
    expect(roleHasPermission('VIEWER', 'workflow:read')).toBe(true);
    expect(roleHasPermission('VIEWER', 'task:read')).toBe(true);
    expect(roleHasPermission('VIEWER', 'analytics:read')).toBe(true);

    expect(roleHasPermission('VIEWER', 'workflow:create')).toBe(false);
    expect(roleHasPermission('VIEWER', 'workflow:update')).toBe(false);
    expect(roleHasPermission('VIEWER', 'task:update')).toBe(false);
    expect(roleHasPermission('VIEWER', 'member:invite')).toBe(false);
    expect(roleHasPermission('VIEWER', 'workspace:update')).toBe(false);
  });

  it('lets members do the work but not restructure the workspace', () => {
    expect(roleHasPermission('MEMBER', 'workflow:create')).toBe(true);
    expect(roleHasPermission('MEMBER', 'workflow:execute')).toBe(true);
    expect(roleHasPermission('MEMBER', 'task:create')).toBe(true);
    expect(roleHasPermission('MEMBER', 'ai:use')).toBe(true);

    expect(roleHasPermission('MEMBER', 'workflow:delete')).toBe(false);
    expect(roleHasPermission('MEMBER', 'task:delete')).toBe(false);
    expect(roleHasPermission('MEMBER', 'member:invite')).toBe(false);
    expect(roleHasPermission('MEMBER', 'workspace:delete')).toBe(false);
  });

  it('lets admins manage people but not destroy the workspace', () => {
    expect(roleHasPermission('ADMIN', 'member:invite')).toBe(true);
    expect(roleHasPermission('ADMIN', 'member:update_role')).toBe(true);
    expect(roleHasPermission('ADMIN', 'workflow:delete')).toBe(true);
    expect(roleHasPermission('ADMIN', 'audit:read')).toBe(true);

    expect(roleHasPermission('ADMIN', 'workspace:delete')).toBe(false);
  });

  it('reserves workspace deletion for the owner', () => {
    expect(roleHasPermission('OWNER', 'workspace:delete')).toBe(true);
    for (const permission of [
      'workspace:read',
      'workflow:execute',
      'member:invite',
      'analytics:read',
    ] as const) {
      expect(roleHasPermission('OWNER', permission)).toBe(true);
    }
  });

  it('never grants a permission to a lower role but not a higher one', () => {
    // A monotonic hierarchy: if a role can do something, every more privileged
    // role must also be able to. A violation here means the matrix has a hole.
    const ordered: WorkspaceRole[] = ['VIEWER', 'MEMBER', 'ADMIN', 'OWNER'];

    for (let index = 0; index < ordered.length - 1; index += 1) {
      const lower = ordered[index];
      const higher = ordered[index + 1];

      for (const permission of [
        'workspace:read',
        'workspace:update',
        'member:invite',
        'workflow:read',
        'workflow:create',
        'workflow:delete',
        'task:read',
        'task:update',
        'analytics:read',
        'ai:use',
      ] as const) {
        if (roleHasPermission(lower, permission)) {
          expect(
            roleHasPermission(higher, permission),
            `${higher} lacks ${permission} that ${lower} has`,
          ).toBe(true);
        }
      }
    }
  });

  it('defines a permission set for every role', () => {
    for (const role of WORKSPACE_ROLES) {
      expect(roleHasPermission(role, 'workspace:read')).toBe(true);
    }
  });
});

describe('roleAtLeast', () => {
  it('compares roles by privilege', () => {
    expect(roleAtLeast('OWNER', 'ADMIN')).toBe(true);
    expect(roleAtLeast('ADMIN', 'ADMIN')).toBe(true);
    expect(roleAtLeast('MEMBER', 'ADMIN')).toBe(false);
    expect(roleAtLeast('VIEWER', 'MEMBER')).toBe(false);
  });
});

describe('canAssignRole', () => {
  it('forbids assigning the owner role through the member API', () => {
    // Ownership transfer is a separate flow; allowing it here would let an admin
    // take over a workspace.
    for (const actor of WORKSPACE_ROLES) {
      expect(canAssignRole(actor, 'OWNER')).toBe(false);
    }
  });

  it('requires strictly greater privilege than the target role', () => {
    expect(canAssignRole('OWNER', 'ADMIN')).toBe(true);
    expect(canAssignRole('OWNER', 'MEMBER')).toBe(true);
    expect(canAssignRole('OWNER', 'VIEWER')).toBe(true);

    expect(canAssignRole('ADMIN', 'MEMBER')).toBe(true);
    expect(canAssignRole('ADMIN', 'VIEWER')).toBe(true);
    expect(canAssignRole('ADMIN', 'ADMIN')).toBe(false);

    expect(canAssignRole('MEMBER', 'MEMBER')).toBe(false);
    expect(canAssignRole('MEMBER', 'ADMIN')).toBe(false);
    expect(canAssignRole('VIEWER', 'VIEWER')).toBe(false);
  });

  it('prevents self-promotion at every level', () => {
    for (const actor of WORKSPACE_ROLES) {
      for (const target of WORKSPACE_ROLES) {
        if (target === 'OWNER') continue;
        // An actor may never assign a role to which they have no privilege
        // advantage, which includes their own role.
        if (actor === target) {
          expect(canAssignRole(actor, target)).toBe(false);
        }
      }
    }
  });
});

describe('canRemoveMember', () => {
  it('never allows removing an owner', () => {
    for (const actor of WORKSPACE_ROLES) {
      expect(canRemoveMember(actor, 'OWNER')).toBe(false);
    }
  });

  it('requires strictly greater privilege than the target', () => {
    expect(canRemoveMember('OWNER', 'ADMIN')).toBe(true);
    expect(canRemoveMember('ADMIN', 'MEMBER')).toBe(true);
    expect(canRemoveMember('ADMIN', 'VIEWER')).toBe(true);

    expect(canRemoveMember('ADMIN', 'ADMIN')).toBe(false);
    expect(canRemoveMember('VIEWER', 'VIEWER')).toBe(false);
    expect(canRemoveMember('MEMBER', 'MEMBER')).toBe(false);
  });

  it('is not sufficient on its own: the caller still needs member:remove', () => {
    // `canRemoveMember` only answers "is the target below the actor's rank".
    // A member outranks a viewer, so this returns true — the real block is that
    // MEMBER does not hold `member:remove`. Keeping both checks separate is what
    // makes that explicit, and this test pins that separation.
    expect(canRemoveMember('MEMBER', 'VIEWER')).toBe(true);
    expect(roleHasPermission('MEMBER', 'member:remove')).toBe(false);
    expect(roleHasPermission('ADMIN', 'member:remove')).toBe(true);
  });
});
