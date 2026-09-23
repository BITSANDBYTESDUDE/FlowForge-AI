'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tasksApi, workflowsApi, workspacesApi } from '@/lib/api/endpoints';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import {
  TASK_PRIORITIES,
  type TaskPriority,

  type TaskSummary,
} from '@/types/task';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Create/edit task dialog.
 *
 * Used for both modes: `task` null means create. The form is a plain controlled
 * component rather than a form library because there are six fields and no
 * cross-field rules — a resolver would add indirection without removing work.
 *
 * Errors from the API (which validates with Zod) are surfaced as toasts rather
 * than field errors; the schema is the authority, and duplicating its messages
 * per field would drift.
 */
export function TaskDialog({
  open,
  onOpenChange,
  task,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskSummary | null;
  onSaved: () => void;
}) {
  const { activeWorkspace } = useWorkspace();
  const isEdit = Boolean(task);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState<string>('__unassigned');
  const [workflowId, setWorkflowId] = useState<string>('__none');
  const [dueDate, setDueDate] = useState('');

  // Reset whenever the dialog opens so a previous edit does not leak into the
  // next one.
  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setPriority(task?.priority ?? 'MEDIUM');
    setAssigneeId(task?.assigneeId ?? '__unassigned');
    setWorkflowId(task?.workflowId ?? '__none');
    setDueDate(task?.dueDate ? task.dueDate.slice(0, 10) : '');
  }, [open, task]);

  const members = useQuery({
    queryKey: ['members', activeWorkspace?.id],
    queryFn: () => workspacesApi.members(activeWorkspace!.id),
    enabled: Boolean(activeWorkspace) && open,
  });

  const workflows = useQuery({
    queryKey: ['workflows', activeWorkspace?.id, 'for-task'],
    queryFn: () => workflowsApi.list({ workspaceId: activeWorkspace!.id, limit: 100 }),
    enabled: Boolean(activeWorkspace) && open,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        workspaceId: activeWorkspace!.id,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assigneeId: assigneeId === '__unassigned' ? null : assigneeId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      };

      if (task) return tasksApi.update(task.id, body);
      return tasksApi.create({
        ...body,
        ...(workflowId !== '__none' ? { workflowId } : {}),
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Task updated' : 'Task created');
      onSaved();
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const invalid = title.trim().length < 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Changes are applied immediately. Status is changed from the task list.'
              : 'Tasks created here stand alone. Tasks linked to a workflow step are created when you run that workflow.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              placeholder="What needs to be done?"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Anything the owner needs to know"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                <SelectTrigger id="task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-assignee">Assignee</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger id="task-assignee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned">Unassigned</SelectItem>
                {(members.data?.members ?? []).map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.user?.name ?? member.userId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isEdit ? (
            <div className="space-y-1.5">
              <Label htmlFor="task-workflow">Workflow (optional)</Label>
              <Select value={workflowId} onValueChange={setWorkflowId}>
                <SelectTrigger id="task-workflow">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Standalone task</SelectItem>
                  {(workflows.data?.items ?? []).map((workflow) => (
                    <SelectItem key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Linking to a workflow lets completion advance a running execution.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={invalid}>
            {isEdit ? 'Save changes' : 'Create task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

