import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { WorkspaceProvider } from '@/components/dashboard/workspace-provider';

/**
 * Dashboard layout.
 *
 * Session is resolved on the server, so an unauthenticated or expired session
 * never renders dashboard chrome. The middleware cookie check is only an early
 * redirect; this is the real gate.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession().catch(() => null);
  if (!session) redirect('/login?next=/dashboard');

  return (
    <WorkspaceProvider>
      <DashboardShell
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }}
      >
        {children}
      </DashboardShell>
    </WorkspaceProvider>
  );
}
