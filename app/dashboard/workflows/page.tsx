import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkflowList } from '@/components/workflow/workflow-list';

export const metadata = { title: 'Workflows' };

export default function WorkflowsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <WorkflowList />
    </Suspense>
  );
}
