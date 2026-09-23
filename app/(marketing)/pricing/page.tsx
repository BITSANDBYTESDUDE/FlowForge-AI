import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple workspace-based pricing. Start free, upgrade when your team grows.',
};

/**
 * Plan definitions.
 *
 * These describe intended packaging. Billing is not implemented — the app has no
 * payment provider wired up, and the plan field on a workspace is informational.
 * Limits shown here are the ones the product is designed around, not enforced
 * quotas, and the page says so rather than implying a checkout that does not
 * exist.
 */
const plans = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    description: 'For trying FlowForge on one real process.',
    cta: 'Start free',
    href: '/register',
    highlighted: false,
    features: [
      '1 workspace',
      'Up to 3 workflows',
      'AI workflow generation',
      'Visual builder with undo',
      'Task tracking and deadlines',
      'Version history',
    ],
  },
  {
    name: 'Pro',
    price: '$19',
    cadence: 'per month',
    description: 'For freelancers and individuals running client work.',
    cta: 'Start free',
    href: '/register',
    highlighted: true,
    features: [
      'Unlimited workflows',
      'Workflow execution tracking',
      'AI improvement and task generation',
      'Analytics and productivity metrics',
      'Template library access',
      'Priority AI rate limits',
    ],
  },
  {
    name: 'Team',
    price: '$49',
    cadence: 'per month',
    description: 'For teams who need shared process and accountability.',
    cta: 'Start free',
    href: '/register',
    highlighted: false,
    features: [
      'Everything in Pro',
      'Unlimited members with roles',
      'Workspace activity feed',
      'Audit log',
      'Per-person performance analytics',
      'Shared template library',
    ],
  },
];

const faqs = [
  {
    q: 'Is billing actually implemented?',
    a: 'No. There is no payment provider connected in this build. Plans exist as a field on the workspace and the limits above describe the intended packaging — nothing will charge you, and nothing is enforced as a hard quota yet.',
  },
  {
    q: 'What happens without an OpenAI key?',
    a: 'AI endpoints return a clear unavailable error and the interface tells you so. Everything else — the builder, tasks, executions, analytics, and templates — works without any AI provider configured.',
  },
  {
    q: 'Can I self-host it?',
    a: 'Yes. It is a standard Next.js application with a MongoDB dependency. Set the environment variables and run it. Upstash and object storage are optional; without them the rate limiter falls back to an in-process counter.',
  },
  {
    q: 'Do you train on my workflow data?',
    a: 'No. Workflow content is sent to the configured model provider only when you invoke an AI feature, and it is never used to train models by this application.',
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="border-b">
        <div className="container py-16 text-center md:py-20">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Pricing that starts at free
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Every plan begins with a free account. Upgrade when your process outgrows a single
            workspace — not before.
          </p>
        </div>
      </section>

      <section className="container py-14">
        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={cn('relative flex flex-col', plan.highlighted && 'border-primary shadow-md')}
            >
              {plan.highlighted ? (
                <Badge className="absolute -top-2.5 left-5">Most popular</Badge>
              ) : null}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <div className="flex items-baseline gap-1.5 pt-2">
                  <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.cadence}</span>
                </div>
                <CardDescription className="pt-1">{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <ul className="flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-success"
                        aria-hidden="true"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-6 w-full"
                  variant={plan.highlighted ? 'default' : 'outline'}
                >
                  <Link href={plan.href}>
                    {plan.cta}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Prices shown are illustrative for this build. No payment provider is connected.
        </p>
      </section>

      <section className="border-t bg-muted/30 py-16">
        <div className="container">
          <h2 className="text-xl font-semibold tracking-tight">Questions worth answering up front</h2>
          <dl className="mt-8 grid gap-8 sm:grid-cols-2">
            {faqs.map((faq) => (
              <div key={faq.q}>
                <dt className="text-sm font-semibold">{faq.q}</dt>
                <dd className="mt-2 text-sm text-muted-foreground">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="container py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Try it on a process you already know</h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          The fastest way to judge this is to describe something real and see what comes back.
        </p>
        <Button asChild size="lg" className="mt-7">
          <Link href="/register">
            Create an account
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </section>
    </>
  );
}
