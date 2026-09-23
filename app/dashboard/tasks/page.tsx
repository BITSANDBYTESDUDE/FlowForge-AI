import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskList } from '@/components/task/task-list';

export const metadata = { title: 'Tasks' };

export default function TasksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TaskList />
    </Suspense>
  );
}
