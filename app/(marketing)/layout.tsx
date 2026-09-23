import type { Metadata } from 'next';
import { MarketingFooter, MarketingHeader } from '@/components/shared/marketing-chrome';

export const metadata: Metadata = {
  title: 'FlowForge AI — Turn a described process into a working workflow',
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
