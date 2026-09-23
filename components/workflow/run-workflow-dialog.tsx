'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Play } from 'lucide-react';
import { workflowsApi } from '@/lib/api/endpoints';
import { useWorkspace } from '@/components/dashboard/workspace-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WorkflowDetail } from '@/types/workflow';

/**
 * Starts an execution.
 *
 * A workflow is a definition; an execution is one run of it. The label is what
 * distinguishes runs of the same definition ("Client A", "Client B"), which is
 * why it is asked for rather than generated.
 */
export function RunWorkflowDialog({
  open,
  onOpenChange,
  workflow,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: WorkflowDetail;
  onStarted: (executionId: string) => void;
}) {
  const { activeWorkspace } = useWorkspace();
  const [label, setLabel] = useState('');

  const start = useMutation({
    mutationFn: () =>
      workflowsApi.execute(workflow.id, activeWorkspace!.id, label.trim() || null),
    onSuccess: (data) => {
      toast.success('Execution started');
      setLabel('');
      onStarted(data.execution.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Run “{workflow.name}”</DialogTitle>
          <DialogDescription>
            Each run tracks its own progress. The workflow definition stays unchanged, so you can run
            it again for a different client or project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="execution-label">Label (optional)</Label>
          <Input
            id="execution-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
            placeholder="e.g. Client A"
            disabled={start.isPending}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Running creates tasks for task steps. Existing tasks for the same steps are reused, not
            duplicated.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={start.isPending}>
            Cancel
          </Button>
          <Button onClick={() => start.mutate()} loading={start.isPending}>
            <Play className="size-3.5" />
            {start.isPending ? 'Starting…' : 'Start execution'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
