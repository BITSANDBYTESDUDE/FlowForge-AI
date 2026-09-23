'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FolderPlus } from 'lucide-react';
import { workspacesApi } from '@/lib/api/endpoints';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * First-run state.
 *
 * A new account has no workspace, and every other dashboard screen depends on
 * one. Rather than showing broken empty lists, the dashboard asks for the one
 * thing it needs.
 */
export function NoWorkspaceState() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const createWorkspace = useMutation({
    mutationFn: () => workspacesApi.create({ name: name.trim() }),
    onSuccess: () => {
      toast.success('Workspace created');
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="flex flex-col items-center p-8 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-primary/10">
          <FolderPlus className="size-5 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-base font-semibold">Create your first workspace</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Workflows, tasks, and teammates all live inside a workspace. Name one to get started —
          you will own it.
        </p>

        <form
          className="mt-6 w-full space-y-3 text-left"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            createWorkspace.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="first-workspace">Workspace name</Label>
            <Input
              id="first-workspace"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Agency"
              autoFocus
              disabled={createWorkspace.isPending}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            loading={createWorkspace.isPending}
            disabled={!name.trim()}
          >
            Create workspace
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
