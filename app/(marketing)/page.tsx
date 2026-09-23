import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  GitBranch,
  Layers,
  ListChecks,
  Play,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeIn } from '@/components/shared/fade-in';

const capabilities = [
  {
    icon: Sparkles,
    title: 'Describe it, don’t diagram it',
    description:
      'Write “I want to launch a website for a client” and get a structured graph of tasks, decisions, approvals, and dependencies.',
  },
  {
    icon: GitBranch,
    title: 'A real visual editor',
    description:
      'Drag nodes, rewire edges, assign owners, set due dates, and undo anything. Every save creates a restorable version.',
  },
  {
    icon: Play,
    title: 'Executions, not just plans',
    description:
      'Run the same workflow for Client A and Client B. Progress advances as tasks complete, with pause, resume, and cancel.',
  },
  {
    icon: ListChecks,
    title: 'Tasks as first-class work',
    description:
      'Priorities, deadlines, dependencies, and a transition model that keeps status honest instead of freely editable.',
  },
  {
    icon: Bot,
    title: 'AI that reviews your plan',
    description:
      'Ask for bottlenecks, missing steps, and unclear dependencies. Output is schema-validated before it reaches your data.',
  },
  {
    icon: BarChart3,
    title: 'Analytics from real records',
    description:
      'Completion rates, overdue work, average cycle time, and per-person throughput — computed from the database, not mocked.',
  },
];

const steps = [
  {
    title: 'Describe the process',
    body: 'Plain language. A client launch, a hiring loop, an exam revision plan, a freelance engagement.',
  },
  {
    title: 'Review the generated workflow',
    body: 'FlowForge proposes the nodes and edges. Edit anything in the builder until it matches how you actually work.',
  },
  {
    title: 'Assign, execute, track',
    body: 'Give each step an owner and a deadline, start an execution, and watch progress update as work completes.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/[0.07] to-transparent"
        />
        <div className="container relative py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <FadeIn>
              <Badge variant="default" className="mb-5">
                <Sparkles className="size-3" aria-hidden="true" />
                AI workflow generation
              </Badge>
            </FadeIn>
            <FadeIn delay={0.05}>
              <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                Describe a process.
                <br className="hidden sm:block" />
                <span className="text-muted-foreground"> Get a workflow you can run.</span>
              </h1>
            </FadeIn>
            <FadeIn delay={0.1}>
              <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground">
                FlowForge AI turns how you describe your work into tasks, owners, decisions, and
                deadlines — then tracks them through execution. Built for teams, freelancers,
                students, and anyone with a process that keeps breaking down.
              </p>
            </FadeIn>
            <FadeIn delay={0.15}>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/register">
                    Start free
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/features">See how it works</Link>
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                No credit card. Your first workflow takes about a minute.
              </p>
            </FadeIn>
          </div>

          {/* A static preview of the builder, not a screenshot placeholder. */}
          <FadeIn delay={0.2}>
            <div className="mx-auto mt-14 max-w-4xl">
              <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="flex items-center gap-2 border-b px-4 py-2.5">
                  <span className="flex gap-1.5" aria-hidden="true">
                    <span className="size-2.5 rounded-full bg-muted-foreground/25" />
                    <span className="size-2.5 rounded-full bg-muted-foreground/25" />
                    <span className="size-2.5 rounded-full bg-muted-foreground/25" />
                  </span>
                  <span className="ml-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Workflow className="size-3.5" aria-hidden="true" />
                    Website Launch · v3
                  </span>
                  <Badge variant="success" className="ml-auto">
                    Active
                  </Badge>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-4">
                  {[
                    { label: 'Finalize UI', tone: 'done' },
                    { label: 'Complete development', tone: 'active' },
                    { label: 'Test website', tone: 'todo' },
                    { label: 'Client sign-off', tone: 'approval' },
                  ].map((node, index) => (
                    <div key={node.label} className="relative">
                      <div
                        className={
                          'rounded-lg border p-3 text-xs font-medium ' +
                          (node.tone === 'done'
                            ? 'border-success/40 bg-success/5'
                            : node.tone === 'active'
                              ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                              : node.tone === 'approval'
                                ? 'border-warning/50 bg-warning/5'
                                : 'bg-muted/40')
                        }
                      >
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          {node.tone === 'done' ? (
                            <CheckCircle2 className="size-3 text-success" aria-hidden="true" />
                          ) : (
                            <Layers className="size-3" aria-hidden="true" />
                          )}
                          Step {index + 1}
                        </div>
                        <div className="mt-1.5 text-foreground">{node.label}</div>
                      </div>
                      {index < 3 ? (
                        <ArrowRight
                          className="absolute -right-3 top-1/2 hidden size-3.5 -translate-y-1/2 text-muted-foreground sm:block"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ---------------------------------------------------------- capability */}
      <section className="container py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything a plan needs to survive contact with reality
          </h2>
          <p className="mt-3 text-muted-foreground">
            Generation is the starting point, not the product. The rest is the part that keeps work
            moving.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability, index) => (
            <FadeIn key={capability.title} delay={index * 0.04}>
              <Card className="h-full">
                <CardHeader>
                  <span className="mb-1 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <capability.icon className="size-4" aria-hidden="true" />
                  </span>
                  <CardTitle>{capability.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{capability.description}</CardDescription>
                </CardContent>
              </Card>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------------- steps */}
      <section className="border-y bg-muted/30 py-20">
        <div className="container">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Three steps from description to running work
              </h2>
              <p className="mt-3 text-muted-foreground">
                No template hunting, no blank canvas paralysis. Start with what you already know how
                to say out loud.
              </p>
              <Button asChild className="mt-6">
                <Link href="/register">
                  Create your first workflow
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
            <ol className="space-y-4">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-4 rounded-lg border bg-card p-5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{step.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- trust */}
      <section className="container py-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: 'Workspace isolation',
              body: 'Every request resolves membership before touching a record. Guessing an ID gets you a 403, not data.',
            },
            {
              icon: Bot,
              title: 'Validated AI output',
              body: 'Model responses are parsed and schema-checked before they are persisted. Malformed output is rejected, not stored.',
            },
            {
              icon: Bell,
              title: 'A trail you can read',
              body: 'Activity feed for the team, audit log for sensitive changes, and in-app notifications for assignments.',
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <item.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------------- cta */}
      <section className="border-t bg-muted/30">
        <div className="container py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Your process is already in your head
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Put it somewhere it can be assigned, scheduled, and measured.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">
                Get started free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">View pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
