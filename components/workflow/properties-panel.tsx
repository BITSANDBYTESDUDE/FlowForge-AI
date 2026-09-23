'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useBuilderStore } from '@/lib/workflow/builder-store';
import { workspacesApi } from '@/lib/api/endpoints';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { NODE_DEFAULTS } from '@/lib/workflow/node-defaults';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/shared/empty-state';
import { MousePointerClick } from 'lucide-react';

/**
 * Properties panel for the selected node.
 *
 * `title` and `description` are committed on blur rather than keystroke: each
 * commit pushes an undo snapshot, and per-keystroke snapshots would make undo
 * replay individual letters.
 *
 * `config` edits are type-specific. Only the fields relevant to a node type are
 * rendered, which keeps the panel short and makes the node's purpose obvious.
 */

function ConfigEditor({ nodeId }: { nodeId: string }) {
  const node = useBuilderStore((state) => state.nodes.find((candidate) => candidate.id === nodeId));
  const updateNodeData = useBuilderStore((state) => state.updateNodeData);
  const takeSnapshot = useBuilderStore((state) => state.takeSnapshot);

  if (!node) return null;
  const config = node.data.config;

  function patchConfig(patch: Record<string, unknown>) {
    updateNodeData(nodeId, { config: { ...config, ...patch } });
  }

  switch (node.data.nodeType) {
    case 'DELAY': {
      const delayMinutes = typeof config.delayMinutes === 'number' ? config.delayMinutes : 1440;
      return (
        <div className="space-y-1.5">
          <Label htmlFor="node-delay">Wait for (minutes)</Label>
          <Input
            id="node-delay"
            type="number"
            min={0}
            max={525600}
            value={delayMinutes}
            onFocus={takeSnapshot}
            onChange={(event) => patchConfig({ delayMinutes: Number(event.target.value) || 0 })}
          />
          <p className="text-xs text-muted-foreground">
            {delayMinutes >= 1440
              ? `About ${(delayMinutes / 1440).toFixed(1)} days`
              : delayMinutes >= 60
                ? `About ${(delayMinutes / 60).toFixed(1)} hours`
                : 'Less than an hour'}
          </p>
        </div>
      );
    }

    case 'NOTIFICATION': {
      return (
        <div className="space-y-1.5">
          <Label htmlFor="node-message">Message</Label>
          <Textarea
            id="node-message"
            rows={3}
            maxLength={1000}
            value={typeof config.message === 'string' ? config.message : ''}
            onFocus={takeSnapshot}
            onChange={(event) => patchConfig({ message: event.target.value })}
            placeholder="Tell the team what happened"
          />
        </div>
      );
    }

    case 'AI_ACTION': {
      return (
        <div className="space-y-1.5">
          <Label htmlFor="node-prompt">Prompt</Label>
          <Textarea
            id="node-prompt"
            rows={3}
            maxLength={4000}
            value={typeof config.prompt === 'string' ? config.prompt : ''}
            onFocus={takeSnapshot}
            onChange={(event) => patchConfig({ prompt: event.target.value })}
            placeholder="What should this step produce?"
          />
          <p className="text-xs text-muted-foreground">
            Recorded on the node as an instruction. Automated evaluation of AI actions is not
            implemented — a person completes this step.
          </p>
        </div>
      );
    }

    case 'APPROVAL': {
      return (
        <div className="space-y-1.5">
          <Label>Approvers</Label>
          <ApproverPicker
            selected={Array.isArray(config.approvers) ? (config.approvers as string[]) : []}
            onChange={(approvers) => patchConfig({ approvers })}
          />
          <p className="text-xs text-muted-foreground">
            Recorded as the people who must sign off. No approval request is emailed yet.
          </p>
        </div>
      );
    }

    case 'DECISION':
      return <DecisionConditionEditor nodeId={nodeId} />;

    default:
      return null;
  }
}

function ApproverPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { activeWorkspace } = useWorkspace();
  const takeSnapshot = useBuilderStore((state) => state.takeSnapshot);

  const { data } = useQuery({
    queryKey: ['members', activeWorkspace?.id],
    queryFn: () => workspacesApi.members(activeWorkspace!.id),
    enabled: Boolean(activeWorkspace),
  });

  const members = data?.members ?? [];

  return (
    <div className="space-y-1.5">
      <Select
        value=""
        onValueChange={(value) => {
          takeSnapshot();
          onChange([...new Set([...selected, value])]);
        }}
      >
        <SelectTrigger aria-label="Add an approver">
          <SelectValue placeholder="Add an approver…" />
        </SelectTrigger>
        <SelectContent>
          {members.length === 0 ? (
            <SelectItem value="__none" disabled>
              No members available
            </SelectItem>
          ) : (
            members.map((member) => (
              <SelectItem key={member.userId} value={member.userId}>
                {member.user?.name ?? 'Unknown member'}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {selected.length > 0 ? (
        <ul className="space-y-1">
          {selected.map((userId) => {
            const member = members.find((candidate) => candidate.userId === userId);
            return (
              <li
                key={userId}
                className="flex items-center justify-between rounded border px-2 py-1 text-xs"
              >
                <span className="truncate">{member?.user?.name ?? 'Unknown member'}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${member?.user?.name ?? 'approver'}`}
                  onClick={() => {
                    takeSnapshot();
                    onChange(selected.filter((candidate) => candidate !== userId));
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function DecisionConditionEditor({ nodeId }: { nodeId: string }) {
  const node = useBuilderStore((state) => state.nodes.find((candidate) => candidate.id === nodeId));
  const updateNodeData = useBuilderStore((state) => state.updateNodeData);
  const takeSnapshot = useBuilderStore((state) => state.takeSnapshot);

  const conditions = Array.isArray(node?.data.config.conditions)
    ? (node!.data.config.conditions as { label: string; expression: string }[])
    : [];

  function update(next: { label: string; expression: string }[]) {
    updateNodeData(nodeId, { config: { ...node!.data.config, conditions: next } });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Branches</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            takeSnapshot();
            update([...conditions, { label: 'New branch', expression: 'true' }]);
          }}
        >
          <Plus className="size-3" />
          Add
        </Button>
      </div>

      {conditions.length < 2 ? (
        <p className="rounded border border-warning/40 bg-warning/5 p-2 text-xs text-muted-foreground">
          A decision needs at least two branches before the workflow can be saved.
        </p>
      ) : null}

      <ul className="space-y-2">
        {conditions.map((condition, index) => (
          <li key={index} className="space-y-1.5 rounded border p-2">
            <div className="flex items-center gap-1.5">
              <Input
                value={condition.label}
                aria-label={`Branch ${index + 1} label`}
                className="h-7 text-xs"
                onFocus={takeSnapshot}
                onChange={(event) => {
                  const next = [...conditions];
                  next[index] = { ...condition, label: event.target.value };
                  update(next);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove branch ${index + 1}`}
                onClick={() => {
                  takeSnapshot();
                  update(conditions.filter((_, candidate) => candidate !== index));
                }}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
            <Input
              value={condition.expression}
              aria-label={`Branch ${index + 1} condition`}
              className="h-7 font-mono text-xs"
              placeholder="e.g. approved == true"
              onFocus={takeSnapshot}
              onChange={(event) => {
                const next = [...conditions];
                next[index] = { ...condition, expression: event.target.value };
                update(next);
              }}
            />
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Expressions are evaluated against execution facts. Supported: comparisons
        (<span className="font-mono">==</span>, <span className="font-mono">!=</span>,{' '}
        <span className="font-mono">&gt;</span>, <span className="font-mono">&lt;</span>),
        <span className="font-mono"> &amp;&amp; </span>, <span className="font-mono">||</span>, and{' '}
        <span className="font-mono">!</span>.
      </p>
    </div>
  );
}

export function PropertiesPanel() {
  const selectedNodeId = useBuilderStore((state) => state.selectedNodeId);
  const node = useBuilderStore((state) =>
    state.nodes.find((candidate) => candidate.id === state.selectedNodeId),
  );
  const updateNodeData = useBuilderStore((state) => state.updateNodeData);
  const takeSnapshot = useBuilderStore((state) => state.takeSnapshot);
  const deleteNode = useBuilderStore((state) => state.deleteNode);
  const duplicateNode = useBuilderStore((state) => state.duplicateNode);

  // Local mirrors so typing is responsive while commits stay on blur.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    setTitle(node?.data.title ?? '');
    setDescription(node?.data.description ?? '');
  }, [node?.id, node?.data.title, node?.data.description]);

  if (!selectedNodeId || !node) {
    return (
      <EmptyState
        icon={MousePointerClick}
        title="Nothing selected"
        description="Select a step on the canvas to edit its details, or add one from the palette."
        className="border-0 py-10"
      />
    );
  }

  const defaults = NODE_DEFAULTS[node.data.nodeType];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {defaults.label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{defaults.description}</p>
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Label htmlFor="node-title">Title</Label>
        <Input
          id="node-title"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          onFocus={takeSnapshot}
          onBlur={() => updateNodeData(selectedNodeId, { title })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="node-description">Description</Label>
        <Textarea
          id="node-description"
          rows={3}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onFocus={takeSnapshot}
          onBlur={() => updateNodeData(selectedNodeId, { description })}
          placeholder="What does this step involve?"
        />
      </div>

      {node.data.nodeType === 'TASK' ? (
        <>
          <Separator />
          <AssigneeField nodeId={selectedNodeId} />
          <div className="space-y-1.5">
            <Label htmlFor="node-due">Due date</Label>
            <Input
              id="node-due"
              type="date"
              value={node.data.dueDate ? node.data.dueDate.slice(0, 10) : ''}
              onFocus={takeSnapshot}
              onChange={(event) =>
                updateNodeData(selectedNodeId, {
                  dueDate: event.target.value ? new Date(event.target.value).toISOString() : null,
                })
              }
            />
          </div>
        </>
      ) : null}

      <Separator />
      <ConfigEditor nodeId={selectedNodeId} />

      <Separator />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => duplicateNode(selectedNodeId)}
        >
          Duplicate
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 text-destructive hover:text-destructive"
          onClick={() => deleteNode(selectedNodeId)}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}

function AssigneeField({ nodeId }: { nodeId: string }) {
  const { activeWorkspace } = useWorkspace();
  const node = useBuilderStore((state) => state.nodes.find((candidate) => candidate.id === nodeId));
  const updateNodeData = useBuilderStore((state) => state.updateNodeData);
  const takeSnapshot = useBuilderStore((state) => state.takeSnapshot);

  const { data } = useQuery({
    queryKey: ['members', activeWorkspace?.id],
    queryFn: () => workspacesApi.members(activeWorkspace!.id),
    enabled: Boolean(activeWorkspace),
  });

  const members = data?.members ?? [];

  return (
    <div className="space-y-1.5">
      <Label htmlFor="node-assignee">Assignee</Label>
      <Select
        value={node?.data.assigneeId ?? '__unassigned'}
        onValueChange={(value) => {
          takeSnapshot();
          updateNodeData(nodeId, { assigneeId: value === '__unassigned' ? null : value });
        }}
      >
        <SelectTrigger id="node-assignee">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unassigned">Unassigned</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.userId} value={member.userId}>
              {member?.user?.name ?? "Unknown member"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
