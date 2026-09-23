import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { getExecution } from '@/services/execution.service';
import { getWorkflow } from '@/services/workflow.service';
import { ForbiddenError, NotFoundError } from '@/lib/utils/errors';
import { WorkspaceProvider } from '@/components/dashboard/workspace-provider';
import { ExecutionMonitor } from '@/components/workflow/execution-monitor';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Execution' };

/**
 * Execution route.
 *
 * Both the execution and its workflow are loaded server-side through the
 * permission-checked services. A run id from another workspace resolves to 404
 * rather than revealing that the run exists.
 */
export default async function ExecutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ workflowId: string }>;
  searchParams: Promise<{ execution?: string; workspace?: string }>;
}) {
  const session = await requireSession().catch(() => null);
  if (!session) redirect('/login');

  const { workflowId } = await params;
  const { execution: executionId, workspace: workspaceId } = await searchParams;

  if (!workspaceId || !executionId) {
    redirect(`/workflow/${workflowId}?workspace=${workspaceId ?? ''}`);
  }

  const [execution, workflow] = await Promise.all([
    getExecution(session.user.id, executionId).catch((error) => {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) return null;
      throw error;
    }),
    getWorkflow(session.user.id, workflowId, workspaceId).catch((error) => {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) return null;
      throw error;
    }),
  ]);

  if (!execution || !workflow) notFound();

  return (
    <WorkspaceProvider initialWorkspaceId={workspaceId}>
      <div className="mx-auto max-w-5xl space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/workflow/${workflowId}?workspace=${workspaceId}`}>
            <ArrowLeft className="size-4" />
            Back to builder
          </Link>
        </Button>
        <ExecutionMonitor execution={execution} workflow={workflow} />
      </div>
    </WorkspaceProvider>
  );
}
