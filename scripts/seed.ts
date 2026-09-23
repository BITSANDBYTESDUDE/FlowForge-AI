/**
 * Development seed.
 *
 * Creates a demo workspace with workflows, an execution, tasks, templates,
 * notifications, activity and audit rows so every dashboard surface has real
 * persisted data to render.
 *
 *   npm run seed              # seed (refuses if demo data already exists)
 *   npm run seed -- --force   # remove existing demo data first, then re-seed
 *   npm run seed -- --fresh   # drop the whole database, then seed
 *
 * Two deliberate constraints:
 *
 *  1. This is the only place that writes data the normal flows would not. It
 *     reuses the real services (createWorkspace, createWorkflow, createTask,
 *     createTemplateFromWorkflow, startExecution) rather than inserting
 *     documents directly, so seeded data is structurally identical to
 *     user-created data and the permission checks in those services are
 *     exercised too.
 *  2. It refuses to run in production. Demo data in a live database is a
 *     support incident, not a convenience.
 */
import '@/scripts/load-env';
import mongoose from 'mongoose';
import { serverAuth } from '@/lib/auth/auth';
import { getEnv } from '@/lib/env';
import { connectToDatabase, disconnectFromDatabase, ensureIndexes } from '@/lib/db/connect';
import {
  Activity,
  AuditLog,
  Membership,
  Notification,
  Task,
  Template,
  User,
  Workflow,
  WorkflowExecution,
  WorkflowVersion,
  Workspace,
} from '@/models';
import { createWorkspace } from '@/services/workspace.service';
import { createWorkflow, updateWorkflow } from '@/services/workflow.service';
import { createTask } from '@/services/task.service';
import { createTemplateFromWorkflow } from '@/services/template.service';
import { startExecution } from '@/services/execution.service';
import type { WorkflowGraphInput } from '@/schemas/workflow.schema';
import type { TemplateCategory } from '@/models/Template';
import { logger } from '@/lib/utils/logger';


const DEMO_PASSWORD = 'FlowForge!Demo2024';

type SeedUser = { id: string; email: string; name: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' };

const OWNER = { email: 'owner@flowforge.dev', name: 'Ayesha Khan' };

const USERS: SeedUser[] = [
  { id: '', email: 'admin@flowforge.dev', name: 'Bilal Ahmed', role: 'ADMIN' },
  { id: '', email: 'member@flowforge.dev', name: 'Sara Malik', role: 'MEMBER' },
  { id: '', email: 'viewer@flowforge.dev', name: 'Usman Raza', role: 'VIEWER' },
];

/* ------------------------------------------------------------- graph helpers */

type NodeSpec = {
  type: WorkflowGraphInput['nodes'][number]['type'];
  title: string;
  description?: string;
  assignee?: 'admin' | 'member';
  dueInDays?: number;
  config?: Record<string, unknown>;
};

/**
 * A workflow is a graph, not a list: DECISION and APPROVAL nodes branch, and the
 * schema requires a decision to have at least two outgoing edges. Edges are
 * therefore stated explicitly as index pairs rather than inferred from order.
 */
type GraphSpec = {
  nodes: NodeSpec[];
  /** `[fromIndex, toIndex]` pairs into `nodes`. */
  edges: Array<[number, number]>;
};

/* ----------------------------------------------------------------- demo data */

type WorkflowSpec = {
  name: string;
  description: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  tags: string[];
  graph: GraphSpec;
  templateCategory?: TemplateCategory;
  tasks?: Array<{
    title: string;
    description: string;
    status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    assignTo: 'admin' | 'member';
    dueInDays: number;
  }>;
};

const WORKFLOWS: WorkflowSpec[] = [
  {
    name: 'Client Website Launch',
    description:
      'End-to-end delivery of a client marketing website, from design sign-off through to go-live and handover.',
    status: 'ACTIVE',
    tags: ['client', 'delivery', 'web'],
    templateCategory: 'Development',
    graph: {
      nodes: [
        { type: 'START', title: 'Start', description: 'Kick off the engagement.' },
        {
          type: 'TASK',
          title: 'Finalise sitemap and wireframes',
          description: 'Agree the page inventory with the client and freeze the wireframes.',
          assignee: 'admin',
          dueInDays: 4,
        },
        {
          type: 'APPROVAL',
          title: 'Design sign-off',
          description: 'The client approves the visual direction before the build starts.',
        },
        {
          type: 'TASK',
          title: 'Build front end',
          description: 'Implement responsive pages against the approved designs.',
          assignee: 'admin',
          dueInDays: 18,
        },
        {
          type: 'DECISION',
          title: 'Client content ready?',
          description: 'Copy and assets must be in hand before QA can start.',
          config: {
            conditions: [
              { label: 'Ready', expression: 'status != "BLOCKED"' },
              { label: 'Waiting', expression: 'status == "BLOCKED"' },
            ],
          },
        },
        {
          type: 'TASK',
          title: 'Chase client for missing content',
          description: 'Send a reminder and agree a revised content deadline.',
          assignee: 'member',
          dueInDays: 21,
        },
        {
          type: 'TASK',
          title: 'Run cross-browser QA',
          description: 'Verify on Chrome, Firefox and Safari at mobile widths.',
          assignee: 'member',
          dueInDays: 24,
        },
        {
          type: 'DELAY',
          title: 'Pre-launch cool-off',
          description: 'Two-day buffer for a final client review.',
          config: { delayMinutes: 2880 },
        },
        {
          type: 'NOTIFICATION',
          title: 'Notify client of launch',
          description: 'Send the go-live confirmation.',
          config: { message: 'Your site is live.' },
        },
        { type: 'END', title: 'Complete', description: 'Site handed over.' },
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 6], // content ready
        [4, 5], // content missing
        [5, 6],
        [6, 7],
        [7, 8],
        [8, 9],
      ],
    },
    tasks: [
      {
        title: 'Collect brand assets from client',
        description: 'Logos, fonts, photography and brand guidelines.',
        status: 'COMPLETED',
        priority: 'HIGH',
        assignTo: 'member',
        dueInDays: -6,
      },
      {
        title: 'Finalise sitemap and wireframes',
        description: 'Agree the page inventory with the client and freeze the wireframes.',
        status: 'COMPLETED',
        priority: 'HIGH',
        assignTo: 'admin',
        dueInDays: -2,
      },
      {
        title: 'Build front end',
        description: 'Implement responsive pages against the approved designs.',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        assignTo: 'admin',
        dueInDays: 9,
      },
      {
        title: 'Write on-page copy',
        description: 'Awaiting client-supplied product descriptions.',
        status: 'BLOCKED',
        priority: 'MEDIUM',
        assignTo: 'member',
        dueInDays: -1,
      },
      {
        title: 'Run cross-browser QA',
        description: 'Verify on Chrome, Firefox and Safari at mobile widths.',
        status: 'TODO',
        priority: 'MEDIUM',
        assignTo: 'member',
        dueInDays: 16,
      },
    ],
  },
  {
    name: 'Customer Onboarding',
    description:
      'Standard onboarding sequence for a new paying customer, from contract signature to the first review.',
    status: 'ACTIVE',
    tags: ['onboarding', 'customer-success'],
    templateCategory: 'Business',
    graph: {
      nodes: [
        { type: 'START', title: 'Start', description: 'Contract signed.' },
        {
          type: 'TASK',
          title: 'Provision account',
          description: 'Create the tenant and invite the primary contact.',
          assignee: 'admin',
          dueInDays: 1,
        },
        {
          type: 'AI_ACTION',
          title: 'Draft welcome email',
          description: 'Generate a personalised welcome message from the account notes.',
          config: { prompt: 'Draft a warm welcome email for a newly onboarded customer.' },
        },
        {
          type: 'TASK',
          title: 'Run kickoff call',
          description: 'Walk through the product and agree success criteria.',
          assignee: 'member',
          dueInDays: 5,
        },
        {
          type: 'DELAY',
          title: 'Wait 30 days',
          description: 'Let the customer settle before the first review.',
          config: { delayMinutes: 43200 },
        },
        {
          type: 'TASK',
          title: 'Hold 30-day review',
          description: 'Check adoption and address blockers.',
          assignee: 'member',
          dueInDays: 32,
        },
        { type: 'END', title: 'Complete', description: 'Customer live and reviewed.' },
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 6],
      ],
    },
    tasks: [
      {
        title: 'Provision account',
        description: 'Create the tenant and invite the primary contact.',
        status: 'COMPLETED',
        priority: 'URGENT',
        assignTo: 'admin',
        dueInDays: -3,
      },
      {
        title: 'Run kickoff call',
        description: 'Walk through the product and agree success criteria.',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        assignTo: 'member',
        dueInDays: 2,
      },
      {
        title: 'Send onboarding survey',
        description: 'Short pulse survey after the kickoff call.',
        status: 'TODO',
        priority: 'LOW',
        assignTo: 'member',
        dueInDays: 7,
      },
    ],
  },
  {
    name: 'Product Launch Email Campaign',
    description: 'Planned launch announcement across email, social and the blog.',
    status: 'DRAFT',
    tags: ['marketing', 'email'],
    templateCategory: 'Marketing',
    graph: {
      nodes: [
        { type: 'START', title: 'Start', description: 'Launch date agreed.' },
        { type: 'TASK', title: 'Write launch copy', description: 'Headline, body and CTA variants.' },
        { type: 'TASK', title: 'Build landing page', description: 'Single page with a signup form.' },
        {
          type: 'DECISION',
          title: 'Regulated claim?',
          description: 'Route any regulated claims through legal before sending.',
          config: {
            conditions: [
              { label: 'Needs legal', expression: 'priority == "URGENT"' },
              { label: 'Standard', expression: 'priority != "URGENT"' },
            ],
          },
        },
        {
          type: 'TASK',
          title: 'Obtain legal sign-off',
          description: 'Legal reviews the regulated wording.',
          assignee: 'admin',
          dueInDays: 10,
        },
        {
          type: 'NOTIFICATION',
          title: 'Announce to the list',
          description: 'Send to the full subscriber list.',
          config: { message: 'We just launched.' },
        },
        { type: 'END', title: 'Complete', description: 'Campaign sent.' },
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4], // needs legal
        [3, 5], // standard
        [4, 5],
        [5, 6],
      ],
    },
  },
  {
    name: 'Legacy Migration Runbook',
    description: 'Superseded one-off data migration, retained for reference.',
    status: 'ARCHIVED',
    tags: ['migration', 'archived'],
    graph: {
      nodes: [
        { type: 'START', title: 'Start', description: 'Migration window opened.' },
        { type: 'TASK', title: 'Snapshot source data', description: 'Take a verified backup first.' },
        { type: 'TASK', title: 'Transform and load', description: 'Run the ETL scripts.' },
        { type: 'END', title: 'Complete', description: 'Migration finished.' },
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    },
  },
];

/* ------------------------------------------------------------------ builders */

let nodeSeq = 0;

/**
 * Converts a declarative spec into the exact shape `createWorkflow` accepts.
 * Positions are laid out top-to-bottom by index; the builder re-layouts on open
 * anyway, so exact coordinates only need to be sane.
 */
function buildGraph(spec: GraphSpec, assignees: Record<'admin' | 'member', string>): WorkflowGraphInput {
  const idByIndex = spec.nodes.map(() => `seed-node-${++nodeSeq}`);

  const nodes: WorkflowGraphInput['nodes'] = spec.nodes.map((node, index) => {
    const built: WorkflowGraphInput['nodes'][number] = {
      id: idByIndex[index]!,
      type: node.type,
      title: node.title,
      // `description` is a required string in the schema; passing null fails.
      description: node.description ?? '',
      position: { x: 160, y: index * 150 },
      config: node.config ?? {},
      // Required by the graph schema. The builder populates this from node
      // config when a user edits a node, so seeded nodes carry an empty object.
      metadata: {},
    };

    if (node.assignee) built.assigneeId = assignees[node.assignee];

    if (node.dueInDays !== undefined) {
      const due = new Date();
      due.setDate(due.getDate() + node.dueInDays);
      built.dueDate = due.toISOString();
    }

    return built;
  });

  const edges: WorkflowGraphInput['edges'] = spec.edges.map(([from, to], index) => ({
    id: `seed-edge-${index + 1}`,
    source: idByIndex[from]!,
    target: idByIndex[to]!,
  }));

  return { nodes, edges };
}

/**
 * Inserts a node directly before the terminal END node and rewires the edge that
 * pointed at END, so the resulting graph is still linear and executable.
 *
 * Used to give the flagship workflow a genuine v1 -> v2 history. A description
 * edit alone does not create a version: `updateWorkflow` treats only a graph
 * change as a version boundary.
 */
function insertBeforeEnd(
  graph: WorkflowGraphInput,
  spec: NodeSpec,
  assigneeId: string,
): WorkflowGraphInput {
  const end = graph.nodes.find((n) => n.type === 'END');
  if (!end) throw new Error('Graph has no END node to insert before');

  const incoming = graph.edges.find((e) => e.target === end.id);
  if (!incoming) throw new Error('END node has no incoming edge');

  const newNode: WorkflowGraphInput['nodes'][number] = {
    id: `seed-node-${++nodeSeq}`,
    type: spec.type,
    title: spec.title,
    description: spec.description ?? '',
    // sits just above END; React Flow re-layouts on open anyway
    position: { x: end.position.x, y: end.position.y - 75 },
    config: spec.config ?? {},
    metadata: {},
    assigneeId,
  };
  if (spec.dueInDays !== undefined) {
    const due = new Date();
    due.setDate(due.getDate() + spec.dueInDays);
    newNode.dueDate = due.toISOString();
  }

  return {
    nodes: [...graph.nodes, newNode],
    edges: [
      ...graph.edges.map((e) => (e.id === incoming.id ? { ...e, target: newNode.id } : e)),
      { id: `seed-edge-${graph.edges.length + 1}`, source: newNode.id, target: end.id },
    ],
  };
}

/* ------------------------------------------------------------------ helpers */

async function ensureUser(email: string, name: string): Promise<string> {
  const existing = await User.findOne({ email }).lean();
  if (existing) return String(existing._id);

  // Credentials must go through Better Auth: it owns the `account` collection
  // holding the scrypt hash, so inserting a User row directly would create an
  // account that exists but can never sign in. `serverAuth` is the instance
  // without the Next cookie plugin, which cannot run outside a request scope.
  const result = await serverAuth.api.signUpEmail({
    body: { email, password: DEMO_PASSWORD, name },
  });
  if (!result?.user?.id) throw new Error(`Better Auth did not return a user for ${email}`);
  return result.user.id;
}

async function addMembership(
  workspaceId: string,
  email: string,
  role: 'ADMIN' | 'MEMBER' | 'VIEWER',
): Promise<void> {
  // workspace.service.inviteMember resolves an email to a *pending invitation*;
  // every seed user already exists, so the membership row is written directly
  // with the same shape the service would produce.
  const user = await User.findOne({ email }).lean();
  if (!user) throw new Error(`Cannot invite unknown user ${email}`);
  const exists = await Membership.exists({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    userId: user._id,
  });
  if (exists) return;
  await Membership.create({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    userId: user._id,
    role,
    permissions: [],
  });
}

async function wipeDemoData(): Promise<void> {
  const emails = [OWNER.email, ...USERS.map((u) => u.email)];
  const users = await User.find({ email: { $in: emails } }).select('_id').lean();
  const userIds = users.map((u) => u._id);
  if (userIds.length === 0) return;

  const memberships = await Membership.find({ userId: { $in: userIds } })
    .select('workspaceId')
    .lean();
  const workspaceIds = memberships.map((m) => m.workspaceId);

  await Promise.all([
    Workflow.deleteMany({ workspaceId: { $in: workspaceIds } }),
    Task.deleteMany({ workspaceId: { $in: workspaceIds } }),
    WorkflowVersion.deleteMany({ workspaceId: { $in: workspaceIds } }),
    WorkflowExecution.deleteMany({ workspaceId: { $in: workspaceIds } }),
    Notification.deleteMany({ workspaceId: { $in: workspaceIds } }),
    Activity.deleteMany({ workspaceId: { $in: workspaceIds } }),
    AuditLog.deleteMany({ workspaceId: { $in: workspaceIds } }),
    Template.deleteMany({ createdBy: { $in: userIds } }),
    Membership.deleteMany({ workspaceId: { $in: workspaceIds } }),
    Workspace.deleteMany({ ownerId: { $in: userIds } }),
  ]);

  // Better Auth's `account` and `session` collections are not modelled by
  // Mongoose, so they are cleared through the raw driver.
  const db = mongoose.connection.db;
  if (db) {
    const ids = userIds.map(String);
    await Promise.all([
      db.collection('account').deleteMany({ userId: { $in: ids } }),
      db.collection('session').deleteMany({ userId: { $in: ids } }),
    ]);
  }
  await User.deleteMany({ _id: { $in: userIds } });
}

/* --------------------------------------------------------------------- main */

async function seed(force: boolean, fresh: boolean): Promise<void> {
  const env = getEnv();
  if (env.NODE_ENV === 'production') throw new Error('Refusing to seed: NODE_ENV is production.');
  if (!env.SEED_ENABLED) {
    throw new Error('Refusing to seed: set SEED_ENABLED=true in your .env first.');
  }

  await connectToDatabase();

  if (fresh) {
    logger.warn('--fresh passed: dropping the entire database');
    await mongoose.connection.dropDatabase();
  } else if (force) {
    logger.info('--force passed: removing existing demo data');
    await wipeDemoData();
  }

  // Must run *after* any drop: dropping the database removes its indexes, and
  // Mongoose builds declared indexes in the background, so a process that seeds
  // and exits would otherwise leave the collections unindexed — losing the
  // unique constraints on User.email and Workspace.slug entirely.
  await ensureIndexes();

  if (await User.exists({ email: OWNER.email })) {
    logger.warn(`${OWNER.email} already exists. Re-run with --force to replace demo data.`);
    return;
  }

  logger.info('Creating demo users…');
  const ownerId = await ensureUser(OWNER.email, OWNER.name);
  const assignees = {} as Record<'admin' | 'member', string>;
  for (const user of USERS) {
    user.id = await ensureUser(user.email, user.name);
    if (user.role === 'ADMIN') assignees.admin = user.id;
    if (user.role === 'MEMBER') assignees.member = user.id;
    logger.info(`  ${user.email} (${user.role})`);
  }

  logger.info('Creating workspace…');
  const workspace = await createWorkspace(ownerId, {
    name: 'Northwind Studio',
    slug: 'northwind-studio',
  });
  const workspaceId = workspace.id;

  for (const user of USERS) {
    await addMembership(workspaceId, user.email, user.role);
  }

  logger.info('Creating workflows…');
  const created: Array<{ id: string; spec: WorkflowSpec; graph: WorkflowGraphInput }> = [];

  for (const spec of WORKFLOWS) {
    const graph = buildGraph(spec.graph, assignees);
    const workflow = await createWorkflow(ownerId, {
      workspaceId,
      name: spec.name,
      description: spec.description,
      status: spec.status,
      tags: spec.tags,
      graph,
    });
    created.push({ id: workflow.id, spec, graph });
    logger.info(`  ${spec.name} (${spec.graph.nodes.length} nodes)`);

    for (const task of spec.tasks ?? []) {
      const due = new Date();
      due.setDate(due.getDate() + task.dueInDays);
      await createTask(ownerId, {
        workspaceId,
        workflowId: workflow.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assigneeId: assignees[task.assignTo],
        dueDate: due.toISOString(),
        dependencies: [],
      });
    }
  }

  // Give the flagship workflow a real second version so the version-history
  // panel has something to compare. Only a graph change creates a version, so
  // this inserts an actual node rather than editing the description.
  const flagship = created.find((w) => w.spec.name === 'Client Website Launch');
  if (flagship) {
    logger.info('Saving a second workflow version…');
    await updateWorkflow(ownerId, flagship.id, workspaceId, {
      workspaceId,
      graph: insertBeforeEnd(
        flagship.graph,
        {
          type: 'TASK',
          title: 'Hand over credentials and documentation',
          description: 'Transfer DNS, hosting and CMS access to the client with a short handover doc.',
          dueInDays: 28,
        },
        assignees.admin,
      ),
      changeSummary: 'Added a post-launch handover step',
    });
  }

  const active = created.find((w) => w.spec.status === 'ACTIVE');
  if (active) {
    logger.info('Starting an execution…');
    try {
      await startExecution(ownerId, active.id, workspaceId, 'Northwind round 1');
    } catch (error) {
      // A workflow failing the executable-graph check should not abort the seed;
      // the remaining data is still useful and the message is operator-facing.
      logger.warn(
        `Could not start an execution: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  logger.info('Creating templates…');
  for (const source of created) {
    if (!source.spec.templateCategory) continue;
    try {
      await createTemplateFromWorkflow(ownerId, workspaceId, source.id, {
        name: `${source.spec.name} Template`,
        description: source.spec.description,
        category: source.spec.templateCategory,
        tags: source.spec.tags,
      });
      logger.info(`  ${source.spec.name} Template`);
    } catch (error) {
      logger.warn(
        `Skipped template for ${source.spec.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  logger.info('');
  logger.info('Seed complete.');
  logger.info('  Sign in at http://localhost:3000/login');
  logger.info(`  Password for every demo account: ${DEMO_PASSWORD}`);
  logger.info(`    ${OWNER.email}   — OWNER`);
  for (const user of USERS) {
    logger.info(`    ${user.email}   — ${user.role}`);
  }
}

/* --------------------------------------------------------------- entrypoint */

const args = process.argv.slice(2);

seed(args.includes('--force'), args.includes('--fresh'))
  .then(async () => {
    await disconnectFromDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    // The stack goes to the terminal only. This script is operator-facing, and
    // nothing here is ever returned in an HTTP response.
    logger.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) console.error(error.stack);
    await disconnectFromDatabase().catch(() => undefined);
    process.exit(1);
  });
