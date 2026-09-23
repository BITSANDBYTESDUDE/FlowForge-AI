import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth/session';
import { getWorkflow } from '@/services/workflow.service';
import { ForbiddenError, NotFoundError } from '@/lib/utils/errors';
import { WorkspaceProvider } from '@/components/dashboard/workspace-provider';
import { WorkflowBuilder } from '@/components/workflow/workflow-builder';

export const metadata: Metadata = {
  title: 'Workflow builder',
};

/**
 * Workflow builder route.
 *
 * The workflow is loaded on the server through the same permission-checked
 * service the API uses, so an unauthorized id 404s here rather than rendering a
 * shell that fails later. `workspaceId` comes from the query string and is
 * verified as part of the lookup — the client cannot widen its own access by
 * changing that parameter.
 */
export default async function WorkflowBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ workflowId: string }>;
  searchParams: Promise<{ workspace?: string }>;
}) {
  const session = await requireSession().catch(() => null);
  if (!session) redirect('/login');

  const { workflowId } = await params;
  const { workspace: workspaceId } = await searchParams;

  if (!workspaceId) {
    redirect('/dashboard/workflows');
  }

  const workflow = await getWorkflow(session.user.id, workflowId, workspaceId).catch((error) => {
    // A missing workflow and a workflow in a workspace the user cannot reach are
    // both reported as 404: distinguishing them would leak the existence of other
    // tenants' resources.
    if (error instanceof NotFoundError || error instanceof ForbiddenError) return null;
    throw error;
  });

  if (!workflow) notFound();

  return (
    <WorkspaceProvider initialWorkspaceId={workspaceId}>
      <WorkflowBuilder workflowId={workflowId} initialWorkflow={workflow} />
    </WorkspaceProvider>
  );
}
