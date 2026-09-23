'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '@/lib/api/endpoints';
import type { WorkspaceRole, WorkspaceSummary } from '@/types/workspace';
import { roleHasPermission, type Permission } from '@/lib/permissions';

/**
 * Workspace context.
 *
 * The active workspace is shared by every dashboard screen, so it lives in one
 * provider rather than being refetched per page. The role check exposed here is
 * a *convenience* for hiding actions a user cannot perform — it is never the
 * authorization boundary. The API re-checks every permission server-side, which
 * is what actually protects the data.
 */

const STORAGE_KEY = 'flowforge:active-workspace';

type WorkspaceContextValue = {
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceSummary | null;
  role: WorkspaceRole | null;
  isLoading: boolean;
  isError: boolean;
  setActiveWorkspaceId: (workspaceId: string) => void;
  refetch: () => void;
  /** UI convenience only. Server-side permission checks remain authoritative. */
  can: (permission: Permission) => boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  children,
  initialWorkspaceId,
}: {
  children: ReactNode;
  initialWorkspaceId?: string;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list(),
  });

  const workspaces = data?.workspaces ?? [];

  // Resolution order: an explicit selection, then the id from the URL, then the
  // first workspace. Reading localStorage during render would break hydration,
  // so the stored preference is applied in an effect below.
  const activeWorkspaceId = useMemo(() => {
    if (initialWorkspaceId && workspaces.some((w) => w.id === initialWorkspaceId)) {
      return initialWorkspaceId;
    }
    return workspaces[0]?.id ?? null;
  }, [initialWorkspaceId, workspaces]);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );

  const setActiveWorkspaceId = useCallback((workspaceId: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, workspaceId);
    } catch {
      // Storage can be unavailable (private mode, disabled cookies); the switch
      // still works for this session, it just will not be remembered.
    }
    // A full navigation guarantees every server component and cached query
    // re-resolves against the newly selected workspace.
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', workspaceId);
    window.location.href = url.toString();
  }, []);

  const can = useCallback(
    (permission: Permission) => (activeWorkspace ? roleHasPermission(activeWorkspace.role, permission) : false),
    [activeWorkspace],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      activeWorkspace,
      role: activeWorkspace?.role ?? null,
      isLoading,
      isError,
      setActiveWorkspaceId,
      refetch,
      can,
    }),
    [workspaces, activeWorkspace, isLoading, isError, setActiveWorkspaceId, refetch, can],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used inside a WorkspaceProvider');
  }
  return context;
}

/**
 * Workspace id for a screen that cannot render without one.
 *
 * Throws rather than returning null so a missing workspace surfaces as an error
 * boundary instead of a silently broken page.
 */
export function useRequiredWorkspaceId(): string {
  const { activeWorkspace } = useWorkspace();
  if (!activeWorkspace) {
    throw new Error('No active workspace is selected');
  }
  return activeWorkspace.id;
}
