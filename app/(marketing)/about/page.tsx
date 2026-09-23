import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Boxes, Database, Lock, Route, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Why FlowForge AI exists, how it is built, and the architectural decisions behind it.',
};

const decisions = [
  {
    icon: Route,
    title: 'A modular monolith',
    body: 'One Next.js application with a service layer, not a fleet of microservices. Business logic lives in services that take an explicit user id and resolve permissions themselves, so no route handler can accidentally skip authorization. This keeps the operational surface small while leaving the seams clean enough to extract a worker later.',
  },
  {
    icon: Database,
    title: 'MongoDB with deliberate indexes',
    body: 'Workflows are documents with embedded nodes and edges — they are read and written whole, so embedding avoids joins on the hot path. Indexes are added only where a real query needs them, and every list endpoint filters by workspace at the query level rather than in application code.',
  },
  {
    icon: Lock,
    title: 'Authorization as a single choke point',
    body: 'Every request resolves the same chain: authenticated session, then workspace membership, then the specific permission. Resource lookups always include the workspace id in their filter, which means a valid membership can never reach another tenant’s document.',
  },
  {
    icon: Boxes,
    title: 'AI behind a validated boundary',
    body: 'Model output is never written to the database directly. Responses are parsed against a schema, then checked against business rules — does the graph have a reachable start, do edges reference real nodes — and rejected with a clear error if they fail. Prompts live in their own modules per task.',
  },
  {
    icon: Server,
    title: 'Optional infrastructure',
    body: 'MongoDB and a session secret are the only hard requirements. Redis, object storage, and the AI provider are optional, and each has a documented fallback so a developer can run the whole product locally without signing up for anything.',
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="border-b">
        <div className="container py-16 md:py-20">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Most processes fail quietly, between the plan and the work
            </h1>
            <p className="mt-4 text-muted-foreground">
              Teams rarely lack a plan. They lack a plan that survives being handed to other people.
              A description in a document has no owners, no deadlines, and no state. FlowForge exists
              to close that gap: describe the process once, then run it as many times as you need,
              with visibility into where it actually is.
            </p>
          </div>
        </div>
      </section>

      <section className="container py-14">
        <h2 className="text-xl font-semibold tracking-tight">Architecture decisions</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          The reasoning behind the shape of the system, written down so it can be argued with.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {decisions.map((decision) => (
            <Card key={decision.title}>
              <CardHeader>
                <span className="mb-1 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <decision.icon className="size-4" aria-hidden="true" />
                </span>
                <CardTitle>{decision.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{decision.body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/30 py-14">
        <div className="container grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">What is built today</h2>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              {[
                'Email and password authentication with session-based access control',
                'Workspaces with owner, admin, member, and viewer roles',
                'Workflow CRUD with a React Flow builder, undo/redo, and version history',
                'AI generation, improvement, task generation, and summarization — schema validated',
                'Tasks with status transitions, priorities, deadlines, and dependencies',
                'An execution engine with pause, resume, cancel, and progress tracking',
                'A template library across seven categories',
                'Notifications, workspace activity feed, and an append-only audit log',
                'Analytics computed from stored records, plus global search',
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">What is deliberately not built</h2>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              {[
                'Billing and subscription enforcement — plans are informational',
                'External integrations (Slack, Google Calendar, GitHub, Jira) — designed for, not implemented',
                'Scheduled and webhook-triggered automations',
                'Email delivery — notification events exist behind a service abstraction',
                'Real-time collaboration on the canvas — saves are last-write-wins with version history as the safety net',
                'File attachments — object storage configuration exists but no upload feature uses it',
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-muted-foreground">
              This list is here so the product is judged on what it does rather than what a roadmap
              slide implies it might.
            </p>
          </div>
        </div>
      </section>

      <section className="container py-16">
        <div className="rounded-lg border bg-card p-8 text-center">
          <h2 className="text-xl font-semibold tracking-tight">
            Describe one process and decide for yourself
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            The generation step is fast. Whether the rest earns its place depends on your workflow,
            not this page.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/register">
              Get started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
