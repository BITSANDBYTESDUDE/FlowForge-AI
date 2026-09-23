'use client';

import { useQuery } from '@tanstack/react-query';
import { activityApi } from '@/lib/api/endpoints';
import type { ActivityFeedItem } from '@/types/api';
import { formatRelative } from '@/lib/utils/format';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Activity } from 'lucide-react';

/**
 * Human-readable phrasing for each activity action.
 *
 * Kept as a lookup with a fallback so an action added on the server renders as
 * readable text rather than a raw enum string.
 */
const ACTION_PHRASES: Record<string, string> = {
  'workflow.created': 'created a workflow',
  'workflow.updated': 'updated',
  'workflow.deleted': 'deleted a workflow',
  'workflow.executed': 'started an execution of',
  'task.created': 'created a task',
  'task.completed': 'completed',
  'task.updated': 'updated a task',
  'task.assigned': 'assigned a task',
  'member.invited': 'invited a member',
  'member.removed': 'removed a member',
  'member.role_changed': 'changed a member role',
  'template.applied': 'applied a template',
  'workspace.updated': 'updated the workspace',
};

/** Renders an activity row's sentence. Never trusts the entity name's presence. */
function describe(activity: ActivityFeedItem): string {
  const phrase = ACTION_PHRASES[activity.action] ?? activity.action.replace(/[._]/g, ' ');
  const title = typeof activity.metadata?.title === 'string' ? activity.metadata.title : null;
  const name = typeof activity.metadata?.name === 'string' ? activity.metadata.name : null;
  const label = title ?? name;
  return label ? `${phrase} ${label}` : phrase;
}

export function ActivityFeed({ limit = 12 }: { limit?: number }) {
  const { activeWorkspace, isLoading: workspaceLoading } = useWorkspace();

  const { data, isLoading } = useQuery({
    queryKey: ['activity', activeWorkspace?.id, limit],
    queryFn: () => activityApi.feed(activeWorkspace!.id, limit),
    enabled: Boolean(activeWorkspace),
  });

  const loading = workspaceLoading || isLoading;

  if (loading) {
    return (
      <ul className="space-y-3" aria-busy="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <li key={index} className="flex items-center gap-3">
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-20" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  const activity = data?.activity ?? [];

  if (activity.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Creating workflows, completing tasks, and inviting members will show up here."
        className="border-0 py-8"
      />
    );
  }

  return (
    <ul className="space-y-3">
      {activity.map((item) => {
        const initials =
          item.actor.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? '')
            .join('') || '?';

        return (
          <li key={item.id} className="flex items-start gap-3">
            <Avatar className="size-7 shrink-0">
              {item.actor.avatar ? <AvatarImage src={item.actor.avatar} alt="" /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">
                <span className="font-medium">{item.actor.name}</span>{' '}
                <span className="text-muted-foreground">{describe(item)}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                {formatRelative(item.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
