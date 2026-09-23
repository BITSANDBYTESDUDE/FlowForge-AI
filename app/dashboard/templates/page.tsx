import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplateLibrary } from '@/components/template/template-library';

export const metadata = { title: 'Templates' };

export default function TemplatesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TemplateLibrary />
    </Suspense>
  );
}
