export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Ordered least → most privileged. Used for comparisons. */
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  logo: string | null;
  plan: 'FREE' | 'PRO' | 'TEAM';
  createdAt: string;
  updatedAt: string;
  role: WorkspaceRole;
};

export type MembershipSummary = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  user: { id: string; name: string; email: string; avatar: string | null } | null;
};

export type WorkspaceDetail = WorkspaceSummary & {
  settings: {
    defaultWorkflowStatus: 'DRAFT' | 'ACTIVE';
    allowGuestViewers: boolean;
    aiEnabled: boolean;
  };
  memberCount: number;
};
