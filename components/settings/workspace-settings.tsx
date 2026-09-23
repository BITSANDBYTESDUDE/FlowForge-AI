'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Save, UserPlus } from 'lucide-react';
import { usersApi, workspacesApi } from '@/lib/api/endpoints';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { ROLE_DESCRIPTIONS, canAssignRole } from '@/lib/permissions';
import { WORKSPACE_ROLES, type WorkspaceRole } from '@/types/workspace';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Workspace settings: general, defaults, members, danger zone.
 *
 * Role controls are filtered by the same helpers the API uses to authorize a
 * change, so the UI cannot offer a promotion the server would reject. OWNER is
 * never assignable here — ownership transfer is a separate, deliberate flow.
 */
export function WorkspaceSettings() {
  const queryClient = useQueryClient();
  const { activeWorkspace, isLoading: workspaceLoading, can, role } = useWorkspace();

  const [name, setName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('MEMBER');
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (activeWorkspace) setName(activeWorkspace.name);
  }, [activeWorkspace]);

  const workspaceId = activeWorkspace?.id;

  const detail = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const members = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => workspacesApi.members(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  // Needed to stop a user from changing their own role, which would be a
  // self-escalation (or self-demotion) path.
  const me = useQuery({ queryKey: ['me'], queryFn: () => usersApi.me() });

  const updateWorkspace = useMutation({
    mutationFn: (body: Parameters<typeof workspacesApi.update>[1]) =>
      workspacesApi.update(workspaceId!, body),
    onSuccess: () => {
      toast.success('Workspace updated');
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const invite = useMutation({
    mutationFn: () =>
      workspacesApi.invite(workspaceId!, { email: inviteEmail.trim(), role: inviteRole }),
    onSuccess: (result) => {
      toast.success(`${result.member.user?.name ?? inviteEmail} added to the workspace`);
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeRole = useMutation({
    mutationFn: ({ memberId, nextRole }: { memberId: string; nextRole: WorkspaceRole }) =>
      workspacesApi.updateMemberRole(workspaceId!, memberId, nextRole),
    onSuccess: () => {
      toast.success('Role updated');
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => workspacesApi.removeMember(workspaceId!, memberId),
    onSuccess: () => {
      toast.success('Member removed');
      setPendingRemove(null);
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setPendingRemove(null);
    },
  });

  if (workspaceLoading || !activeWorkspace) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const memberList = members.data?.members ?? [];
  const settings = detail.data?.workspace.settings;
  const currentUserId = me.data?.user.id;
  const nameChanged = name.trim() !== activeWorkspace.name && name.trim().length > 0;

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------- general */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
          <CardDescription>How this workspace is identified across the app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              disabled={!can('workspace:update')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workspace-slug">Slug</Label>
            <Input id="workspace-slug" value={activeWorkspace.slug} readOnly disabled />
            <p className="text-xs text-muted-foreground">
              The slug is used in URLs and cannot be changed after creation.
            </p>
          </div>

          {can('workspace:update') ? (
            <Button
              onClick={() => updateWorkspace.mutate({ name: name.trim() })}
              loading={updateWorkspace.isPending}
              disabled={!nameChanged}
            >
              <Save className="size-4" />
              Save changes
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Only admins and the owner can change workspace settings.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------- defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow defaults</CardTitle>
          <CardDescription>Applied to new workflows in this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {detail.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <SettingRow
                id="default-status"
                label="New workflows start as active"
                description="Off means new workflows are created as drafts, which cannot be executed until published."
                checked={settings?.defaultWorkflowStatus === 'ACTIVE'}
                disabled={!can('workspace:update')}
                onChange={(checked) =>
                  updateWorkspace.mutate({
                    settings: { defaultWorkflowStatus: checked ? 'ACTIVE' : 'DRAFT' },
                  })
                }
              />
              <Separator />
              <SettingRow
                id="ai-enabled"
                label="AI features enabled"
                description="Turning this off blocks the generation and analysis endpoints for this workspace."
                checked={settings?.aiEnabled ?? true}
                disabled={!can('workspace:update')}
                onChange={(checked) => updateWorkspace.mutate({ settings: { aiEnabled: checked } })}
              />
              <Separator />
              <SettingRow
                id="guest-viewers"
                label="Allow guest viewers"
                description="Lets viewer-role members see workflows without being able to change anything."
                checked={settings?.allowGuestViewers ?? false}
                disabled={!can('workspace:update')}
                onChange={(checked) =>
                  updateWorkspace.mutate({ settings: { allowGuestViewers: checked } })
                }
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
          <CardDescription>
            {memberList.length} member{memberList.length === 1 ? '' : 's'} with access to this
            workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {can('member:invite') ? (
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                if (inviteEmail.trim()) invite.mutate();
              }}
            >
              <Input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="colleague@company.com"
                aria-label="Email address to add"
                className="flex-1"
              />
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value as WorkspaceRole)}
              >
                <SelectTrigger className="sm:w-36" aria-label="Role for the new member">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* OWNER excluded: ownership transfer is a separate flow. */}
                  {WORKSPACE_ROLES.filter((candidate) => candidate !== 'OWNER').map((candidate) => (
                    <SelectItem
                      key={candidate}
                      value={candidate}
                      disabled={!canAssignRole(role!, candidate)}
                    >
                      {candidate.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" loading={invite.isPending} disabled={!inviteEmail.trim()}>
                <UserPlus className="size-4" />
                Add
              </Button>
            </form>
          ) : null}

          <p className="text-xs text-muted-foreground">
            The person must already have a FlowForge account. Invitation emails are not sent.
          </p>

          {members.isLoading ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y">
              {memberList.map((member) => {
                const memberName = member.user?.name ?? 'Unknown member';
                const editable =
                  Boolean(role) &&
                  can('member:update_role') &&
                  member.role !== 'OWNER' &&
                  member.userId !== currentUserId;

                return (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">
                          {memberName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {memberName}
                          {member.userId === currentUserId ? (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              (you)
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.user?.email ?? '—'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {editable ? (
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            changeRole.mutate({
                              memberId: member.id,
                              nextRole: value as WorkspaceRole,
                            })
                          }
                        >
                          <SelectTrigger className="w-32" aria-label={`Role for ${memberName}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WORKSPACE_ROLES.filter(
                              (candidate) =>
                                candidate !== 'OWNER' &&
                                canAssignRole(role!, candidate) &&
                                candidate !== member.role,
                            ).map((candidate) => (
                              <SelectItem key={candidate} value={candidate}>
                                {candidate.toLowerCase()}
                              </SelectItem>
                            ))}
                            {/* Keep the current role selectable so the control
                                renders its own value. */}
                            <SelectItem value={member.role}>
                              {member.role.toLowerCase()}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={member.role === 'OWNER' ? 'default' : 'muted'}>
                          {member.role.toLowerCase()}
                        </Badge>
                      )}

                      {can('member:remove') && member.role !== 'OWNER' && member.userId !== currentUserId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPendingRemove({ id: member.id, name: memberName })}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-xs font-medium">Role reference</p>
            <dl className="mt-2 space-y-1.5">
              {WORKSPACE_ROLES.map((workspaceRole) => (
                <div key={workspaceRole} className="flex gap-2 text-xs">
                  <dt className="w-20 shrink-0 font-medium">{workspaceRole.toLowerCase()}</dt>
                  <dd className="text-muted-foreground">{ROLE_DESCRIPTIONS[workspaceRole]}</dd>
                </div>
              ))}
            </dl>
          </div>
        </CardContent>
      </Card>

      {/* -------------------------------------------------- danger zone */}
      {can('workspace:delete') ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              Danger zone
            </CardTitle>
            <CardDescription>
              Deleting a workspace removes its workflows, tasks, executions and history. Member
              accounts are not affected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled
              title="Workspace deletion is not available yet"
            >
              Delete this workspace
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Deletion is deliberately disabled: the API route is not exposed yet, so the button
              would be a fake action.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog
        open={Boolean(pendingRemove)}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this workspace immediately. Their account and any work they
              authored are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMember.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (pendingRemove) removeMember.mutate(pendingRemove.id);
              }}
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? 'Removing…' : 'Remove member'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingRow({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
