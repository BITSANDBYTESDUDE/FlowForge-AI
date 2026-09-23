import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ResetPasswordForm } from '@/components/shared/reset-password-form';

// `useSearchParams` requires a Suspense boundary in a statically rendered route.
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm space-y-4 rounded-lg border p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
