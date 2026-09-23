import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  GitBranch,
  History,
  Layers,
  ListChecks,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FadeIn } from '@/components/shared/fade-in';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'AI workflow generation, a visual builder, versioning, task management, execution tracking, analytics, and workspace permissions.',
};

const groups = [
  {
    heading: 'Create',
    items: [
      {
        icon: Sparkles,
        title: 'AI workflow generation',
        body: 'Describe a process in a sentence or a paragraph. The model returns a validated graph of nodes and edges, which you then review and edit before saving.',
      },
      {
        icon: Layers,
        title: 'Starter templates',
        body: 'A library covering client onboarding, hiring, product launches, exam revision, and freelance engagements. Duplicate one into your workspace and adapt it.',
      },
      {
        icon: GitBranch,
        title: 'Visual builder',
        body: 'Eight node types — start, end, task, decision, approval, delay, notification, and AI action. Drag to add, connect to sequence, and edit properties in place.',
      },
    ],
  },
  {
    heading: 'Organize',
    items: [
      {
        icon: ListChecks,
        title: 'Task management',
        body: 'Tasks carry status, priority, assignee, deadline, and dependencies. Status moves through a defined transition model rather than being freely overwritten.',
      },
      {
        icon: History,
        title: 'Version history',
        body: 'Each significant change records a version with a change summary. Compare what shifted and restore an earlier graph when a redesign goes wrong.',
      },
      {
        icon: Users,
        title: 'Workspaces and roles',
        body: 'Owner, admin, member, and viewer roles with centrally enforced permissions. Workspace data is isolated at the query layer, not just the UI.',
      },
    ],
  },
  {
    heading: 'Run and measure',
    items: [
      {
        icon: Play,
        title: 'Execution engine',
        body: 'Start an execution of a workflow definition. Progress advances as tasks complete, decision nodes branch on conditions, and you can pause, resume, or cancel.',
      },
      {
        icon: BarChart3,
        title: 'Analytics',
        body: 'Workflow and task completion, overdue work, average cycle time, and per-person throughput — every figure aggregated from stored records.',
      },
      {
        icon: Bell,
        title: 'Notifications and activity',
        body: 'In-app notifications for assignments, completions, and approvals, plus a workspace activity feed and an append-only audit log of sensitive changes.',
      },
    ],
  },
];

const nodeTypes = [
  { type: 'START', body: 'Entry point. Exactly one per execution.' },
  { type: 'TASK', body: 'Human work with an owner and an optional deadline.' },
  { type: 'DECISION', body: 'Branches on conditions you configure.' },
  { type: 'APPROVAL', body: 'Blocks until a designated approver signs off.' },
  { type: 'DELAY', body: 'Waits a fixed interval before continuing.' },
  { type: 'NOTIFICATION', body: 'Emits a message to the team.' },
  { type: 'AI_ACTION', body: 'An automated step described by a prompt.' },
  { type: 'END', body: 'Terminal node that completes the execution.' },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="border-b">
        <div className="container py-16 md:py-20">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              A workflow tool that treats generation as the beginning
            </h1>
            <p className="mt-4 text-muted-foreground">
              Most AI planning tools stop at a document. FlowForge keeps going: the output becomes an
              editable graph, the graph becomes assigned tasks, and the tasks drive a tracked
              execution.
            </p>
          </div>
        </div>
      </section>

      {groups.map((group) => (
        <section key={group.heading} className="container py-14">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.heading}
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item, index) => (
              <FadeIn key={item.title} delay={index * 0.04}>
                <Card className="h-full">
                  <CardHeader>
                    <span className="mb-1 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <item.icon className="size-4" aria-hidden="true" />
                    </span>
                    <CardTitle>{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{item.body}</CardDescription>
                  </CardContent>
                </Card>
              </FadeIn>
            ))}
          </div>
        </section>
      ))}

      <section className="border-y bg-muted/30 py-16">
        <div className="container">
          <h2 className="text-xl font-semibold tracking-tight">The node vocabulary</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            A deliberately small set of primitives. Enough to express real processes without turning
            the canvas into a programming language.
          </p>
          <dl className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {nodeTypes.map((node) => (
              <div key={node.type} className="border-l-2 border-primary/30 pl-3">
                <dt className="font-mono text-xs font-semibold text-primary">{node.type}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{node.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="container py-16">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Built to be trusted</h2>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              {[
                {
                  icon: ShieldCheck,
                  text: 'Authorization resolves session, then membership, then permission, before any record is read.',
                },
                {
                  icon: Bot,
                  text: 'AI responses are validated against a schema and checked against business rules before persistence.',
                },
                {
                  icon: Search,
                  text: 'Global search across workflows, tasks, and templates, indexed at the database layer.',
                },
                {
                  icon: BarChart3,
                  text: 'Rate limiting on AI and auth endpoints, configurable per deployment through environment variables.',
                },
              ].map((item) => (
                <li key={item.text} className="flex gap-3">
                  <item.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-sm font-semibold">What this is not</h3>
            <p className="mt-3 text-sm text-muted-foreground">
              FlowForge is not a code runner and not a general automation platform. Workflow nodes
              coordinate people and track state; they do not execute arbitrary scripts or run
              untrusted code. Integrations with external systems are designed for but not yet built,
              and they live behind service abstractions so they can be added without reshaping the
              core.
            </p>
            <Button asChild className="mt-5">
              <Link href="/register">
                Try it
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
