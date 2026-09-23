import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/shared/providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'FlowForge AI — Describe a process, get an executable workflow',
    template: '%s · FlowForge AI',
  },
  description:
    'FlowForge AI turns a plain-language description of any business, personal, or team process into a structured, executable workflow with tasks, owners, and deadlines.',
  applicationName: 'FlowForge AI',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    title: 'FlowForge AI',
    description:
      'Turn a plain-language process description into an executable workflow with tasks, owners, and deadlines.',
    siteName: 'FlowForge AI',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1120' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` is required by next-themes: the theme class is
    // applied by an inline script before hydration, so the server and client
    // markup differ by design on this element only.
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <a
          href="#main"
          className="sr-only-focusable fixed left-4 top-4 z-[100] rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
