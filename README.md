# FlowForge AI

An AI-powered workflow management and automation platform.

Describe a process in plain language — "I want to launch a website for a client",
"onboard a new employee", "prepare for final exams" — and FlowForge AI turns it
into an editable workflow graph of tasks, decisions, approvals and AI actions.
From there you can run it, assign the work, track progress, and see where things
are slipping.

It is a real multi-tenant SaaS, not a chatbot with a canvas bolted on: every
workflow is persisted, versioned, permission-checked and executable.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database](#database)
- [AI setup](#ai-setup)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Architecture decisions](#architecture-decisions)
- [Roadmap](#roadmap)

---

## Features

### Workflows

- **AI generation** — describe a process, get a structured workflow graph.
- **Visual builder** — drag-and-drop canvas (React Flow) with a node palette,
  a properties inspector, minimap, zoom/pan, and undo/redo.
- **Eight node types** — `START`, `END`, `TASK`, `DECISION`, `APPROVAL`,
  `DELAY`, `NOTIFICATION`, `AI_ACTION`.
- **Versioning** — every significant change writes a `WorkflowVersion`; any
  version can be restored.
- **Statuses** — `DRAFT`, `ACTIVE`, `ARCHIVED`. Only `ACTIVE` workflows run.

### AI

Four server-side capabilities, all validated before anything touches the database:

- `generateWorkflow()` — description → workflow graph
- `improveWorkflow()` — critique an existing graph
- `generateTasks()` — workflow nodes → assignable tasks
- `summarizeWorkflow()` — plain-language summary

### Execution

- Workflows are definitions; runs are separate `WorkflowExecution` records, so
  the same workflow can run independently for Client A and Client B.
- Lifecycle: `PENDING` → `RUNNING` → (`PAUSED` / `COMPLETED` / `FAILED` / `CANCELLED`).
- Start, pause, resume, cancel, complete a step, and read live progress.
- Decision nodes evaluate their configured conditions to pick the next branch.

### Tasks

First-class entities with status (`TODO`, `IN_PROGRESS`, `BLOCKED`, `COMPLETED`,
`CANCELLED`), priority (`LOW` … `URGENT`), assignees, due dates, dependencies,
plus search, filter and sort.

### Collaboration and visibility

- **Workspaces** with `OWNER` / `ADMIN` / `MEMBER` / `VIEWER` roles and a
  central permission matrix.
- **Templates** across seven categories, browsable and duplicable into a workspace.
- **Notifications** for task assignment, completion, overdue work, workflow
  runs and approvals, with unread counts.
- **Activity feed** per workspace, and a separate append-only **audit log** for
  sensitive actions.
- **Analytics** computed from the database — completion rates, overdue counts,
  average completion time, team performance.
- **Global search** across workflows, tasks and templates.

### Product quality

Dark/light/system theming, responsive layouts down to mobile, loading skeletons,
meaningful empty states, toast feedback, keyboard-accessible dialogs and forms.

---

## Architecture

A modular monolith. Next.js App Router serves both the UI and the API; there is
no separate backend service to deploy, and no microservices.

```
Browser
  │
  ├── React Server / Client Components  (app/, components/)
  │        └── TanStack Query ──► fetch ──┐
  │                                       │
  └── Next.js Middleware (optimistic      │
      cookie gate for /dashboard,         │
      /workflow)                          ▼
                                 Route Handlers (app/api/**)
                                          │
                        ┌─────────────────┼─────────────────┐
                        ▼                 ▼                 ▼
                  requireSession    Zod validation    rate limiting
                        │                 │
                        └────────┬────────┘
                                 ▼
                     Services (services/*.service.ts)
                        business logic, no HTTP, no React
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
                 Mongoose     AI provider   Notifications
                 models       (OpenAI)      / audit / activity
                    │
                    ▼
                MongoDB
```

The layers exist to keep three things out of the wrong place:

- **Business logic out of React.** Components call the API; services decide what
  a workflow update means. A rule change touches one service, not five screens.
- **Authorization out of the UI.** Hiding a button is presentation. Enforcement
  happens in the service layer on every request, so a hand-crafted API call is
  rejected the same way a missing button is not shown.
- **AI output out of the database.** The model's response is parsed and validated
  before any service sees it, and the model never writes to MongoDB directly.

The chain every mutating request follows:

```
authenticated user → workspace membership → permission → resource access
```

No route trusts a client-supplied id. A `workspaceId` in a request body is
re-verified against the caller's membership; a `workflowId` in the path is
resolved and checked for workspace access before it is read or written.

---

## Tech stack

| Layer         | Choice                                                    |
| ------------- | --------------------------------------------------------- |
| Framework     | Next.js 15 (App Router), React 19, TypeScript             |
| Styling       | Tailwind CSS, shadcn/ui (Radix primitives), Framer Motion |
| Canvas        | React Flow (`@xyflow/react`)                              |
| Client state  | Zustand (builder store), TanStack Query (server state)    |
| Validation    | Zod (API input _and_ AI output)                           |
| Database      | MongoDB via Mongoose                                      |
| Auth          | Better Auth (session-based)                               |
| AI            | OpenAI API, structured outputs                            |
| Rate limiting | Upstash Redis, with in-memory fallback                    |
| Charts        | Recharts                                                  |
| Tests         | Vitest (unit + integration), Playwright (E2E)             |

---

## Project structure

```
flowforge-ai/
├── app/
│   ├── (marketing)/            # public site: home, features, pricing, about
│   ├── (auth)/                 # login, register, forgot/reset password
│   ├── dashboard/              # overview, workflows, tasks, templates,
│   │                           # analytics, audit, settings
│   ├── workflow/[workflowId]/  # builder + execution monitor
│   └── api/                    # route handlers (the entire backend)
├── components/
│   ├── ui/                     # shadcn primitives
│   ├── shared/                 # cross-feature components (PageHeader, EmptyState…)
│   ├── dashboard/  workflow/  task/  analytics/  ai/
├── lib/
│   ├── ai/                     # provider, JSON schema, prompts, output schemas
│   ├── auth/                   # Better Auth server + client, session helpers
│   ├── db/                     # Mongoose connection with dev hot-reload guard
│   ├── permissions/            # role → permission matrix and guards
│   ├── workflow/               # graph helpers, layout, condition evaluation
│   ├── notifications/  audit/  api/  utils/  hooks/
├── models/                     # 11 Mongoose models + index barrel
├── schemas/                    # Zod schemas shared by API and services
├── services/                   # business logic, one file per domain
├── types/                      # shared TS types and enums
├── middleware.ts               # optimistic route protection
├── scripts/                    # seed, smoke test, verification
├── tests/                      # unit/ and integration/
└── e2e/                        # Playwright specs
```

**Where to look for what:**

| I want to change…                  | Go to                                                       |
| ---------------------------------- | ----------------------------------------------------------- |
| An API response shape              | `schemas/*.schema.ts`, then the matching route              |
| Who can do something               | `lib/permissions/index.ts`                                  |
| What happens when a task completes | `services/task.service.ts`, `services/execution.service.ts` |
| How the AI is prompted             | `lib/ai/prompts/workflow-generation.ts`                     |
| What the AI is allowed to return   | `lib/ai/schemas/workflow-output.ts`                         |
| Execution state transitions        | `services/execution.service.ts`                             |
| Database indexes                   | `models/*.ts`                                               |

---

## Local setup

**Prerequisites:** Node.js 20+, Docker (for MongoDB), and optionally an OpenAI
API key. Everything except AI generation works without a key.

```bash
# 1. Install dependencies
npm install

# 2. Configure the environment
cp .env.example .env
# Generate an auth secret and paste it into AUTH_SECRET:
openssl rand -base64 32

# 3. Start MongoDB
docker compose up -d            # MongoDB only (the common case)
# docker compose --profile full up -d   # + Redis + MinIO, for a production-shaped stack

# 4. Create indexes and seed demo data
npm run seed

# 5. Run it
npm run dev                     # http://localhost:3000
```

The seed script is idempotent — running it twice will not duplicate data. It is
gated behind `SEED_ENABLED` and does nothing in production.

**Useful commands:**

```bash
npm run dev         # dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run format      # prettier --write .
npm test            # unit + integration (Vitest), needs MongoDB
npm run test:e2e    # Playwright, needs a running app + MongoDB
npm run seed        # seed / sync indexes
```

---

## Environment variables

See `.env.example` for the annotated list. The essentials:

| Variable                              | Required | Purpose                                                   |
| ------------------------------------- | -------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                 | yes      | Public base URL, used for auth callbacks and links        |
| `MONGODB_URI`                         | yes      | MongoDB connection string                                 |
| `AUTH_SECRET`                         | yes      | Session signing secret, 32+ random bytes                  |
| `OPENAI_API_KEY`                      | no       | Without it the AI endpoints use the heuristic fallback    |
| `OPENAI_MODEL`                        | no       | Defaults to `gpt-4o-mini`                                 |
| `OPENAI_BASE_URL`                     | no       | Point at an OpenAI-compatible gateway                     |
| `AI_ALLOW_HEURISTIC_FALLBACK`         | no       | Allows a deterministic local generator when no key is set |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN`   | no       | Distributed rate limiting; falls back to in-memory        |
| `RATE_LIMIT_*`                        | no       | Per-bucket request limits and windows                     |
| `S3_*`                                | no       | Object storage for avatars and attachments                |
| `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_*` | no       | Observability                                             |
| `SEED_ENABLED`                        | no       | Enables `npm run seed`; never enable in production        |

Environment variables are validated at startup by `lib/env.ts`, so a missing
secret fails loudly at boot rather than at the first request that needs it.

Nothing server-side is ever exposed to the browser. `OPENAI_API_KEY`,
`MONGODB_URI`, `AUTH_SECRET` and the Redis/S3 credentials are only read in
server modules.

---

## Database

MongoDB, accessed through Mongoose. Eleven collections:

| Model               | Notes                                                                       |
| ------------------- | --------------------------------------------------------------------------- |
| `User`              | Credentials are managed by Better Auth; no plaintext or hand-rolled hashing |
| `Workspace`         | Unique `slug`, owner, plan, settings                                        |
| `Membership`        | `(workspaceId, userId)` with a role — the join that authorization runs on   |
| `Workflow`          | Graph, status, tags, `currentVersion`                                       |
| `WorkflowVersion`   | Immutable snapshot per meaningful change                                    |
| `WorkflowExecution` | A run: current/completed node ids, status, timestamps                       |
| `Task`              | Assignee, priority, due date, dependencies, node link                       |
| `Template`          | Category, graph, popularity                                                 |
| `Notification`      | Per-user, typed, with a `data` payload                                      |
| `Activity`          | Workspace activity feed                                                     |
| `AuditLog`          | Sensitive actions; append-only from the app's perspective                   |

**Indexes** are declared on the models and synced by `npm run seed`. The
deliberate set: `User.email`, `Workspace.slug`, `Membership.workspaceId`,
`Membership.userId`, `Workflow.workspaceId`, `Workflow.createdBy`,
`Task.workspaceId`, `Task.workflowId`, `Task.assigneeId`,
`Notification.userId`, `Activity.workspaceId`, `AuditLog.workspaceId`.
Indexes are added where a query pattern justifies one, not by default.

Search currently uses indexed MongoDB queries behind a service abstraction
(`services/search.service.ts`), so MongoDB Atlas Search can be introduced later
without touching callers.

**Local vs production.** `docker compose up -d` gives you MongoDB 7 with no auth,
bound to localhost. Production uses MongoDB Atlas with credentials and a
replica set.

---

## AI setup

Set `OPENAI_API_KEY` and the four AI endpoints work end to end. Without a key,
`AI_ALLOW_HEURISTIC_FALLBACK=true` lets `/api/ai/*` fall back to a deterministic
local generator, so the product is fully explorable with no external dependency.
A configured key always takes precedence.

**AI output is never trusted.** Every call follows one pipeline:

```
user input → Zod validation → model → structured output
           → Zod validation → business validation → database
```

- Requests are validated with Zod before the model is called.
- The model is asked for JSON matching a generated JSON Schema
  (`lib/ai/json-schema.ts`).
- The response is parsed and validated against `lib/ai/schemas/workflow-output.ts`.
- Only then does a service lay out the graph and persist it.
- The model has no database access and cannot execute code.

Each prompt lives in `lib/ai/prompts/`, with the output contract next to it, so a
prompt and the schema it must satisfy are reviewed together.

---

## Testing

```bash
npm test            # Vitest: unit + integration (100 tests)
npm run test:e2e    # Playwright: full user journey against a real browser
```

**Unit** — workflow graph validation, the permission matrix, execution logic,
task status transitions, AI output validation. No database, no network.

**Integration** — against a real MongoDB: workspace permissions, workflow CRUD
and versioning, execution lifecycle, and the AI pipeline including the heuristic
fallback. These run serially because they share one database and parallel files
were clearing each other's data.

**End-to-end** — `e2e/journey.spec.ts` walks the path a paying customer takes:

```
register → create workspace → generate a workflow with AI → save → edit
→ publish → run → complete a step → observe progress
```

plus an anonymous visitor being redirected away from the dashboard, a returning
user signing back in, and a wrong password surfacing an error without
authenticating.

The E2E layer earned its place: it caught three defects that unit and integration
tests could not see — a password leaking into the URL on pre-hydration submit, a
React Flow provider crash that broke the entire builder, and AI draft edges
failing validation on save. Run it before you trust a change to the builder or
the auth forms.

Playwright needs the app running:

```bash
npm run dev            # in one shell
npm run test:e2e       # in another
# Or point at a different deployment:
E2E_BASE_URL=https://staging.example.com npm run test:e2e
```

---

## Deployment

Built for Vercel + MongoDB Atlas + Upstash Redis + S3-compatible storage. Only
MongoDB is genuinely required; the rest degrade gracefully.

1. **MongoDB Atlas** — create a cluster, whitelist your deployment, copy the SRV
   string into `MONGODB_URI`.
2. **Vercel** — import the repository. Set the environment variables from
   `.env.example`. `AUTH_SECRET` must be set or auth will refuse to start.
   Leave `SEED_ENABLED` unset.
3. **Upstash Redis** — strongly recommended in production. The in-memory rate
   limiter is per-instance, so on serverless it limits far less than you think.
4. **Indexes** — run `npm run seed` once against production, or sync indexes
   through your migration path.
5. **Storage, monitoring** — set the `S3_*` vars for uploads, and `SENTRY_DSN` /
   `NEXT_PUBLIC_POSTHOG_*` if you want error and product telemetry.

**Health check:** the app serves a public marketing page at `/`; a signed-in user
hitting `/dashboard` without a session is redirected to `/login`.

---

## Security

**Authentication** — Better Auth with session cookies. Passwords are hashed by
the auth provider; this codebase never sees or stores a plaintext password.

**Authorization** — a four-role model (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`)
resolved to a permission list in `lib/permissions/index.ts`. Every mutating
request walks `authenticated user → workspace membership → permission → resource
access`, centrally, in `lib/permissions/guard.ts`.

**Workspace isolation** — a `workspaceId` from the client is never trusted. The
service re-checks the caller's membership against it before reading or writing.

**Middleware** is an optimistic gate only — it checks for the presence of a
session cookie, not its validity, because verifying would mean a database round
trip on every request including static assets. Real enforcement is in the API
layer. A forged cookie gets past the middleware and then fails at the first API
call.

**Input validation** — Zod at every route boundary. MongoDB query safety comes
from Mongoose casting and explicit schema validation rather than string-built
queries.

**Rate limiting** — a bucket abstraction (`ai`, `auth`, `api`) with Upstash Redis
behind it and an in-memory fallback. `/api/ai/*` is limited tightly because each
call costs money; `/api/auth/*` is limited to blunt credential stuffing. All
limits and windows are configurable through environment variables.

**Error handling** — one response envelope, and internal failures never reach the
client:

```json
{
  "success": false,
  "error": { "code": "WORKFLOW_NOT_FOUND", "message": "Workflow not found" }
}
```

with consistent `400`, `401`, `403`, `404`, `409`, `429` and `500` handling.
Stack traces and database errors are logged server-side, never returned.

**Secrets** — never committed, never bundled into client code, and validated at
startup. `.env` is gitignored; only `.env.example` is tracked.

---

## Architecture decisions

**Modular monolith, not microservices.** The domain is cohesive and the team is
small. A single deployable removes network hops, distributed transactions and
service discovery, and the service layer already draws the boundaries that would
make extraction possible later if a specific workload demanded it.

**Services are the only place business logic lives.** Route handlers parse and
authorize; services decide. This is what keeps a React component from becoming
the de facto source of truth for a rule.

**Both API input and AI output are validated with Zod.** The AI is a source of
untrusted input like any other — arguably more so, since its failures are
confident and well-formed. Sharing one schema vocabulary across the boundary
means the model's contract is reviewable in the same idiom as an HTTP request's.

**AI generation is two-phase in the UI.** The model produces a draft that the
user reviews and then explicitly saves. It costs one extra click and buys a
workflow that a user has actually seen before it becomes real data.

**`dryRun` and persist build the graph through the same helper.** The AI returns
edges with only `source` and `target` — ids mean nothing to the model — while
persistence requires ids. An earlier version let the dry-run draft be saved back
verbatim and it failed validation. Both paths now mint ids in one place, so the
preview is persistable by construction and the two cannot drift again.

**One React Flow provider per builder.** React Flow allows a single instance per
provider. The palette is a DOM sibling of the canvas but needs the same instance,
and a second canvas for the mobile layout would have contended for the same
store. The provider now wraps the whole builder and one canvas is reused across
both layouts, switched by CSS.

**Auth forms gate submission on hydration.** A click on a server-rendered form
before React hydrates triggers a native browser submission, serialising every
field into the query string — which put passwords into the URL, browser history
and server logs. The submit control is disabled until hydration completes.

**Workflow definitions and executions are separate collections.** The same
workflow has to run for Client A and Client B without their state colliding, and
without cloning the definition for each run.

**Integration tests run serially.** They share one MongoDB database. Parallel
files were truncating each other's collections, producing failures that looked
like application bugs. Serial execution is slower and honest.

---

## Roadmap

Designed for, not yet built. All integration logic sits behind service
abstractions so these can land without restructuring.

**Integrations** — Slack, Discord, Google Calendar, Gmail, Microsoft Teams,
GitHub, Jira, Trello, Notion.

**Automation** — webhooks, scheduled workflows, conditional triggers, external
actions, so a workflow can start itself.

**AI** — autonomous workflow agents, document → workflow, AI-assisted task
execution, and recommendations learned from how workflows actually run.

**Platform** — MongoDB Atlas Search for the search layer, real email delivery
behind the existing notification abstraction, and a billing plan model where
`plan` currently exists only as a field.

---

## License

Private and proprietary. All rights reserved.
