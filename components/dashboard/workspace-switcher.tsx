'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { workspacesApi } from '@/lib/api/endpoints';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { slugify } from '@/lib/utils/slugify';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';

/** Workspace switcher with an inline create dialog. */
export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, setActiveWorkspaceId, isLoading } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const queryClient = useQueryClient();

  const createWorkspace = useMutation({
    mutationFn: () => workspacesApi.create({ name: name.trim() }),
    onSuccess: (data) => {
      toast.success('Workspace created');
      setCreateOpen(false);
      setName('');
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      // Navigate into the new workspace so the user lands somewhere useful.
      setActiveWorkspaceId(data.workspace.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return <div className="h-9 animate-pulse rounded-md bg-muted" aria-hidden="true" />;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between gap-2 px-2.5"
            aria-label="Switch workspace"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold text-primary">
                {activeWorkspace?.name.slice(0, 1).toUpperCase() ?? '?'}
              </span>
              <span className="truncate text-sm">
                {activeWorkspace?.name ?? 'No workspace'}
              </span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No workspaces yet.</p>
          ) : (
            workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                onClick={() => {
                  if (workspace.id !== activeWorkspace?.id) setActiveWorkspaceId(workspace.id);
                }}
                className="justify-between"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {workspace.id === activeWorkspace?.id ? (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  ) : (
                    <span className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{workspace.name}</span>
                </span>
                <Badge variant="muted" className="shrink-0">
                  {workspace.role.toLowerCase()}
                </Badge>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create a workspace</DialogTitle>
            <DialogDescription>
              Workspaces keep workflows, tasks, and members separate. You will be the owner.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              createWorkspace.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="workspace-name">Name</Label>
              <Input
                id="workspace-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme Agency"
                autoFocus
                disabled={createWorkspace.isPending}
              />
              {name.trim() ? (
                <p className="text-xs text-muted-foreground">
                  Identifier: <span className="font-mono">{slugify(name)}</span>
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={createWorkspace.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" loading={createWorkspace.isPending} disabled={!name.trim()}>
                Create workspace
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
