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
- [Demo accounts](#demo-accounts)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Roles and permissions](#roles-and-permissions)
- [Domain model](#domain-model)
- [API reference](#api-reference)
- [AI setup](#ai-setup)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Architecture decisions](#architecture-decisions)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [License](#license)

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

Four server-side capabilities, all validated before anything touches the
database:

| Function              | Input                      | Output                                    |
| --------------------- | -------------------------- | ----------------------------------------- |
| `generateWorkflow()`  | plain-language description | full graph (nodes + edges + name/tags)    |
| `improveWorkflow()`   | existing graph + goal      | critique: missing, redundant, bottlenecks |
| `generateTasks()`     | workflow nodes             | concrete assignable tasks                 |
| `summarizeWorkflow()` | graph                      | plain-language summary                    |

Without an API key, `AI_ALLOW_HEURISTIC_FALLBACK=true` keeps all four working
from a deterministic local generator, and the response is labelled `heuristic`
so the UI never presents generated output as model output.

### Execution

- Workflows are **definitions**; runs are separate `WorkflowExecution` records,
  so the same workflow can run independently for Client A and Client B.
- Lifecycle: `PENDING` → `RUNNING` → (`PAUSED` / `COMPLETED` / `FAILED` /
  `CANCELLED`), enforced as a state machine.
- Start, pause, resume, cancel, complete a step, and read live progress.
- `START`, `DELAY`, `NOTIFICATION` and `AI_ACTION` nodes auto-resolve without
  human input; `TASK` and `APPROVAL` nodes wait for a person.
- `DECISION` nodes evaluate their configured conditions to pick the next branch.

### Tasks

First-class entities with status (`TODO`, `IN_PROGRESS`, `BLOCKED`,
`COMPLETED`, `CANCELLED`), priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`),
assignees, due dates and dependencies — plus search, filter and sort.

### Collaboration and visibility

- **Workspaces** with `OWNER` / `ADMIN` / `MEMBER` / `VIEWER` roles and a
  central permission matrix.
- **Templates** across seven categories, browsable and duplicable into a
  workspace.
- **Notifications** for assignment, completion, overdue work, workflow runs and
  approvals, with unread counts.
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

### Request lifecycle, concretely

1. **Middleware** (`middleware.ts`) checks for the _presence_ of a session cookie
   on `/dashboard` and `/workflow` and redirects to `/login` if absent. It skips
   `/api` entirely — see [Architecture decisions](#architecture-decisions).
2. **Route handler** (`app/api/**/route.ts`) wraps its body in
   `withApiErrorHandling`, so every thrown error becomes a consistent envelope.
3. **Guard** — `requireApiSession` resolves the session, then charges the rate
   limit against the authenticated user id.
4. **Validation** — `parseJsonBody` parses and Zod-validates the payload,
   returning a `400` with per-field issues on failure.
5. **Authorization** — `requirePermission` walks the caller's membership and
   checks the permission matrix.
6. **Service** (`services/*.service.ts`) performs the work and returns plain
   data. No service imports `next/server`, and none return a `Response`.
7. **Persistence** — Mongoose models, with indexes declared on the schemas.

---

## Tech stack

| Layer         | Choice                                                    |
| ------------- | --------------------------------------------------------- |
| Framework     | Next.js 15 (App Router), React 19, TypeScript             |
| Styling       | Tailwind CSS, shadcn/ui (Radix primitives), Framer Motion |
| Canvas        | React Flow (`@xyflow/react`)                              |
| Client state  | Zustand (builder store), TanStack Query (server state)    |
| Validation    | Zod (API input _and_ AI output)                           |
| Database      | MongoDB 7 via Mongoose                                    |
| Auth          | Better Auth (session-based, MongoDB adapter)              |
| AI            | OpenAI API, structured outputs (JSON Schema)              |
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
│   └── api/                    # 34 route handlers (the entire backend)
├── components/
│   ├── ui/                     # shadcn primitives
│   ├── shared/                 # cross-feature components (PageHeader, EmptyState…)
│   └── dashboard/ workflow/ task/ template/ analytics/ audit/ ai/ settings/
├── lib/
│   ├── ai/                     # provider, JSON schema, prompts, output schemas
│   ├── auth/                   # Better Auth server + client, session helpers
│   ├── db/                     # Mongoose connection with dev hot-reload guard
│   ├── permissions/            # role → permission matrix and guards
│   ├── workflow/               # graph helpers, layout, conditions, builder store
│   ├── notifications/          # transport abstraction (in-app today, email later)
│   ├── audit/                  # append-only audit writer
│   ├── api/                    # typed client, endpoint map, request helpers
│   ├── hooks/  utils/          # shared hooks and formatting/id/slug/logger helpers
│   └── env.ts  rate-limit.ts   # validated env, rate-limit abstraction
├── models/                     # 11 Mongoose models + index barrel
├── schemas/                    # Zod schemas shared by API and services
├── services/                   # business logic, one file per domain
├── types/                      # shared TS types and enum constants
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
| Execution state transitions        | `types/execution.ts`, `services/execution.service.ts`       |
| Decision-node condition evaluation | `lib/workflow/conditions.ts`                                |
| Database indexes                   | `models/*.ts`                                               |
| How errors become responses        | `lib/utils/errors.ts`, `lib/utils/api.ts`                   |

---

## Local setup

**Prerequisites:** Node.js 20+, Docker (for MongoDB), and optionally an OpenAI
API key. Everything except real AI generation works without a key.

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

`docker compose up -d` starts MongoDB 7 on `localhost:27017` with no auth,
matching the default `MONGODB_URI`. The `full` profile adds Redis 7 and MinIO for
testing the production-shaped paths.

The seed script is idempotent — running it twice will not duplicate data. It is
gated behind `SEED_ENABLED` and refuses to run in production.

**Useful commands:**

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Development server                                        |
| `npm run build`     | Production build                                          |
| `npm run start`     | Serve the production build                                |
| `npm run typecheck` | `tsc --noEmit`                                            |
| `npm run lint`      | ESLint via `next lint`                                    |
| `npm run format`    | Prettier, write mode                                      |
| `npm test`          | Vitest — unit + integration (needs MongoDB)               |
| `npm run test:e2e`  | Playwright — full journey (needs a running app + MongoDB) |
| `npm run seed`      | Seed demo data and sync indexes                           |

`scripts/verify-seed.ts` prints collection names and document counts, which is
the quickest way to confirm the seed actually landed. `scripts/smoke-api.ts`
exercises the HTTP surface against a running server (46 checks).

---

## Demo accounts

`npm run seed` creates one workspace — **Northwind Studio** (`northwind-studio`) —
with four members and four seeded workflows covering different node types.

Every account uses the same password: `FlowForge!Demo2024`

| Email                  | Name        | Role     | Use it to test                    |
| ---------------------- | ----------- | -------- | --------------------------------- |
| `owner@flowforge.dev`  | Ayesha Khan | `OWNER`  | Deletion, role changes, audit log |
| `admin@flowforge.dev`  | Bilal Ahmed | `ADMIN`  | Member management, audit log      |
| `member@flowforge.dev` | Sara Malik  | `MEMBER` | Creating and executing workflows  |
| `viewer@flowforge.dev` | Usman Raza  | `VIEWER` | Read-only enforcement             |

Signing in as `viewer@flowforge.dev` and trying to create a workflow is the
fastest way to see authorization working end to end.

---

## Environment variables

See `.env.example` for the annotated list. The essentials:

| Variable                                                              | Required | Purpose                                                   |
| --------------------------------------------------------------------- | -------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                                 | yes      | Public base URL, used for auth callbacks and links        |
| `MONGODB_URI`                                                         | yes      | MongoDB connection string                                 |
| `AUTH_SECRET`                                                         | yes      | Session signing secret, 32+ random bytes                  |
| `BETTER_AUTH_URL`                                                     | no       | Overrides the auth base URL (defaults to the app URL)     |
| `OPENAI_API_KEY`                                                      | no       | Without it the AI endpoints use the heuristic fallback    |
| `OPENAI_MODEL`                                                        | no       | Defaults to `gpt-4o-mini`                                 |
| `OPENAI_BASE_URL`                                                     | no       | Point at an OpenAI-compatible gateway                     |
| `AI_ALLOW_HEURISTIC_FALLBACK`                                         | no       | Allows a deterministic local generator when no key is set |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN`                                   | no       | Distributed rate limiting; falls back to in-memory        |
| `RATE_LIMIT_AI_REQUESTS` / `_WINDOW_SECONDS`                          | no       | AI bucket — 20 per 60s by default                         |
| `RATE_LIMIT_AUTH_REQUESTS` / `_WINDOW_SECONDS`                        | no       | Credential bucket — 10 per 60s by default                 |
| `RATE_LIMIT_API_REQUESTS` / `_WINDOW_SECONDS`                         | no       | General bucket — 300 per 60s by default                   |
| `S3_ENDPOINT` `S3_REGION` `S3_ACCESS_KEY` `S3_SECRET_KEY` `S3_BUCKET` | no       | Object storage for avatars and attachments                |
| `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`   | no       | Observability                                             |
| `SEED_ENABLED`                                                        | no       | Enables `npm run seed`; never enable in production        |

Environment variables are validated at startup by `lib/env.ts`, so a missing
secret fails loudly at boot rather than at the first request that needs it.

Nothing server-side is ever exposed to the browser. `OPENAI_API_KEY`,
`MONGODB_URI`, `AUTH_SECRET` and the Redis/S3 credentials are only read in
server modules. Only `NEXT_PUBLIC_*` values reach client bundles.

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

## Roles and permissions

Four roles resolve to a flat permission list in `lib/permissions/index.ts`.
`lib/permissions/guard.ts` enforces it; nothing else is allowed to decide access.

| Permission         | `VIEWER` | `MEMBER` | `ADMIN` | `OWNER` |
| ------------------ | :------: | :------: | :-----: | :-----: |
| `workspace:read`   |    ✓     |    ✓     |    ✓    |    ✓    |
| `workflow:read`    |    ✓     |    ✓     |    ✓    |    ✓    |
| `task:read`        |    ✓     |    ✓     |    ✓    |    ✓    |
| `template:read`    |    ✓     |    ✓     |    ✓    |    ✓    |
| `analytics:read`   |    ✓     |    ✓     |    ✓    |    ✓    |
| `workflow:create`  |          |    ✓     |    ✓    |    ✓    |
| `workflow:update`  |          |    ✓     |    ✓    |    ✓    |
| `workflow:execute` |          |    ✓     |    ✓    |    ✓    |
| `task:create`      |          |    ✓     |    ✓    |    ✓    |
| `task:update`      |          |    ✓     |    ✓    |    ✓    |
| `task:assign`      |          |    ✓     |    ✓    |    ✓    |
| `template:create`  |          |    ✓     |    ✓    |    ✓    |
| `template:apply`   |          |    ✓     |    ✓    |    ✓    |
| `workspace:update` |          |          |    ✓    |    ✓    |
| `member:invite`    |          |          |    ✓    |    ✓    |
| `member:remove`    |          |          |    ✓    |    ✓    |
| `workflow:delete`  |          |          |    ✓    |    ✓    |
| `task:delete`      |          |          |    ✓    |    ✓    |
| `audit:read`       |          |          |    ✓    |    ✓    |
| `workspace:delete` |          |          |         |    ✓    |

Two rules are enforced separately from the matrix: a member cannot remove or
change the role of the workspace owner, and no one can escalate their own role.
Both are covered by `tests/integration/workspace-permissions.test.ts`.

A caller who is not a member of a workspace receives `403`. Only a workspace that
does not exist at all yields `404`, so the endpoint cannot be used to enumerate
workspace ids.

---

## Domain model

### Node types

| Type           | Human input? | Purpose                                              |
| -------------- | :----------: | ---------------------------------------------------- |
| `START`        |      no      | Entry point; auto-resolves                           |
| `END`          |      no      | Terminal node                                        |
| `TASK`         |     yes      | Work assigned to a person; blocks until completed    |
| `DECISION`     |      no      | Evaluates ordered conditions to choose the next edge |
| `APPROVAL`     |     yes      | Explicit sign-off before continuing                  |
| `DELAY`        |      no      | Time-based wait; auto-resolves                       |
| `NOTIFICATION` |      no      | Sends a notification; auto-resolves                  |
| `AI_ACTION`    |      no      | AI-assisted step; auto-resolves                      |

`START`, `DELAY`, `NOTIFICATION` and `AI_ACTION` are listed in
`AUTOMATIC_NODE_TYPES` (`types/workflow.ts`) and the execution engine advances
past them without waiting.

### Edges

An edge carries `source`, `target`, an optional `condition` and an optional
`label`. Conditions are only meaningful on edges leaving a `DECISION` node.

### Execution state machine

| From        | Allowed next states                          |
| ----------- | -------------------------------------------- |
| `PENDING`   | `RUNNING`, `CANCELLED`                       |
| `RUNNING`   | `PAUSED`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `PAUSED`    | `RUNNING`, `CANCELLED`                       |
| `COMPLETED` | — terminal                                   |
| `FAILED`    | — terminal                                   |
| `CANCELLED` | — terminal                                   |

The transition table lives in `types/execution.ts` so the UI can disable
impossible actions without duplicating the rules; the service still enforces it,
and an illegal transition raises `InvalidTransitionError`.

Execution progresses as:

```
START → find next node → create/activate task → wait for completion
     → check outgoing edges → move to next node → … → END
```

### Notification types

`TASK_ASSIGNED`, `TASK_COMPLETED`, `TASK_OVERDUE`, `WORKFLOW_STARTED`,
`WORKFLOW_COMPLETED`, `APPROVAL_REQUESTED`, `MEMBER_INVITED`,
`WORKFLOW_UPDATED`, `EXECUTION_UPDATED`.

### Audit actions

`WORKFLOW_CREATED`, `WORKFLOW_UPDATED`, `WORKFLOW_DELETED`, `MEMBER_INVITED`,
`MEMBER_REMOVED`, `ROLE_CHANGED`, `WORKFLOW_EXECUTED`, `WORKSPACE_CREATED`,
`WORKSPACE_DELETED`, `TEMPLATE_APPLIED`, `AI_GENERATION`.

Audit entries also record request provenance (user agent and IP) for incident
review. The collection is append-only from the application's perspective — there
is no update or delete path, and the API rejects writes with `405`.

### Template categories

`Business`, `Student`, `Freelancer`, `Marketing`, `Development`, `HR`,
`Personal`.

---

## API reference

All endpoints live under `/api`. Every response uses one envelope:

```json
{ "success": true, "data": { "…": "…" } }
```

```json
{
  "success": false,
  "error": { "code": "WORKFLOW_NOT_FOUND", "message": "Workflow not found" }
}
```

| Method   | Endpoint                                               | Purpose                           |
| -------- | ------------------------------------------------------ | --------------------------------- |
| `GET`    | `/api/users/me`                                        | Current user profile              |
| `*`      | `/api/auth/*`                                          | Better Auth catch-all             |
| `GET`    | `/api/workspaces`                                      | List the caller's workspaces      |
| `POST`   | `/api/workspaces`                                      | Create a workspace                |
| `GET`    | `/api/workspaces/:workspaceId`                         | Read a workspace                  |
| `PATCH`  | `/api/workspaces/:workspaceId`                         | Update a workspace                |
| `DELETE` | `/api/workspaces/:workspaceId`                         | Delete a workspace                |
| `GET`    | `/api/workspaces/:workspaceId/members`                 | List members                      |
| `POST`   | `/api/workspaces/:workspaceId/members`                 | Invite a member                   |
| `PATCH`  | `/api/workspaces/:workspaceId/members/:memberId`       | Change a member's role            |
| `DELETE` | `/api/workspaces/:workspaceId/members/:memberId`       | Remove a member                   |
| `GET`    | `/api/workflows`                                       | List workflows                    |
| `POST`   | `/api/workflows`                                       | Create a workflow                 |
| `GET`    | `/api/workflows/:workflowId`                           | Read a workflow                   |
| `PATCH`  | `/api/workflows/:workflowId`                           | Update a workflow                 |
| `DELETE` | `/api/workflows/:workflowId`                           | Delete a workflow                 |
| `POST`   | `/api/workflows/:workflowId/execute`                   | Start an execution                |
| `GET`    | `/api/workflows/:workflowId/versions`                  | List versions                     |
| `GET`    | `/api/workflows/:workflowId/versions/:version`         | Read one version                  |
| `POST`   | `/api/workflows/:workflowId/versions/:version/restore` | Restore a version                 |
| `GET`    | `/api/executions`                                      | List executions                   |
| `GET`    | `/api/executions/:executionId`                         | Read an execution + progress      |
| `POST`   | `/api/executions/:executionId/pause`                   | Pause                             |
| `POST`   | `/api/executions/:executionId/resume`                  | Resume                            |
| `POST`   | `/api/executions/:executionId/cancel`                  | Cancel                            |
| `GET`    | `/api/tasks`                                           | List / search / filter tasks      |
| `POST`   | `/api/tasks`                                           | Create a task                     |
| `GET`    | `/api/tasks/:taskId`                                   | Read a task                       |
| `PATCH`  | `/api/tasks/:taskId`                                   | Update a task                     |
| `DELETE` | `/api/tasks/:taskId`                                   | Delete a task                     |
| `POST`   | `/api/tasks/:taskId/complete`                          | Complete a task                   |
| `GET`    | `/api/templates`                                       | List / search templates           |
| `POST`   | `/api/templates`                                       | Create a template                 |
| `GET`    | `/api/templates/:templateId`                           | Read a template                   |
| `DELETE` | `/api/templates/:templateId`                           | Delete a template                 |
| `GET`    | `/api/templates/:templateId/apply`                     | Preview a template                |
| `POST`   | `/api/templates/:templateId/apply`                     | Duplicate into a workspace        |
| `POST`   | `/api/ai/generate-workflow`                            | Description → workflow            |
| `POST`   | `/api/ai/improve-workflow`                             | Critique a workflow               |
| `POST`   | `/api/ai/generate-tasks`                               | Nodes → tasks                     |
| `POST`   | `/api/ai/summarize-workflow`                           | Workflow → summary                |
| `GET`    | `/api/notifications`                                   | List notifications + unread count |
| `POST`   | `/api/notifications/:notificationId/read`              | Mark one read                     |
| `POST`   | `/api/notifications/read-all`                          | Mark all read                     |
| `GET`    | `/api/activity`                                        | Workspace activity feed           |
| `GET`    | `/api/audit`                                           | Audit log (requires `audit:read`) |
| `GET`    | `/api/analytics`                                       | Aggregated metrics                |
| `GET`    | `/api/search`                                          | Global search                     |

**Status codes.** `400` invalid input, `401` unauthenticated, `403`
authenticated but not permitted, `404` not found, `409` conflict (e.g. duplicate
slug), `429` rate limited, `500` unexpected. Errors are raised as typed classes in
`lib/utils/errors.ts` and translated centrally, so a route never hand-builds an
error response.

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
- The response is parsed and validated against
  `lib/ai/schemas/workflow-output.ts`.
- Only then does a service lay out the graph and persist it.
- The model has no database access and cannot execute code.

All four prompts and their builders live side by side in
`lib/ai/prompts/workflow-generation.ts`, so a prompt and the contract it must
satisfy are reviewed together. The orchestration lives in
`services/ai.service.ts`.

### Two-phase generation

AI generation is deliberately two-phase in the UI: the model produces a **draft**
that the user reviews and then explicitly saves. It costs one extra click and
buys a workflow the user has actually seen before it becomes real data.

The AI returns edges with only `source` and `target` — node ids mean nothing to
the model — while persistence requires ids. Both the dry-run preview and the save
path mint those ids through the same helper, so a preview is persistable by
construction.

---

## Testing

```bash
npm test            # Vitest: 106 tests across 7 files
npm run test:e2e    # Playwright: full user journey in a real browser
```

### Unit — 45 tests

| File                          | Covers                                                   |
| ----------------------------- | -------------------------------------------------------- |
| `workflow-graph.test.ts` (26) | Graph validation, cycles, orphan nodes, layout, defaults |
| `permissions.test.ts` (13)    | The role → permission matrix and escalation rules        |
| `auth-rate-limit.test.ts` (6) | Auth limiter configuration and the two-tier split        |

No database, no network.

### Integration — 61 tests, against a real MongoDB

| File                                 | Covers                                          |
| ------------------------------------ | ----------------------------------------------- |
| `workspace-permissions.test.ts` (20) | Membership, role changes, isolation, 403s       |
| `execution.test.ts` (18)             | Execution lifecycle, transitions, progress      |
| `workflow-crud.test.ts` (12)         | Workflow CRUD and versioning                    |
| `ai-pipeline.test.ts` (11)           | AI validation path incl. the heuristic fallback |

These run serially (`fileParallelism: false`) because they share one database and
parallel files were clearing each other's collections.

### End-to-end — Playwright

`e2e/journey.spec.ts` walks the path a paying customer takes:

```
register → create workspace → generate a workflow with AI → save → edit
→ publish → run → complete a step → observe progress
```

plus an anonymous visitor redirected away from the dashboard, a returning user
signing back in, and a wrong password surfacing an error without authenticating.

The E2E layer earned its place: it caught three defects unit and integration
tests could not see — a password leaking into the URL on pre-hydration submit, a
React Flow provider crash that broke the entire builder, and AI draft edges
failing validation on save. Run it before trusting a change to the builder or the
auth forms.

Playwright needs the app running:

```bash
npm run dev            # in one shell
npm run test:e2e       # in another
# Or point at a different deployment:
E2E_BASE_URL=https://staging.example.com npm run test:e2e
```

It also runs green against a production build (`npm run build && npm run start`),
which is worth doing before a release — it is the only configuration where
cookies are marked secure.

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
Session cookies are `httpOnly`, `sameSite=lax`, and marked secure in production.
Auth forms disable submission until React hydrates, so a pre-hydration click
cannot serialise credentials into the URL.

**Authorization** — a four-role model resolved to a permission list in
`lib/permissions/index.ts`. Every mutating request walks `authenticated user →
workspace membership → permission → resource access`, centrally, in
`lib/permissions/guard.ts`.

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

**Rate limiting** — two layers, both configurable through environment variables.

Application routes use a bucket abstraction (`ai`, `auth`, `api`) backed by
Upstash Redis with an in-memory fallback, charged against the authenticated user
id in `requireApiSession`. `/api/ai/*` is limited tightly because each call costs
money.

Better Auth's own endpoints (`/api/auth/*`, notably sign-in and sign-up) are
throttled by the library's limiter, configured in `getAuthRateLimitConfig` from
the `RATE_LIMIT_AUTH_*` variables and applied in every environment. Limits are
two-tier: the credential paths get the tight `auth` budget, while other auth
paths — including `/get-session`, which runs on every page load — fall back to
the generous `api` budget. Throttling a session read by the credential budget
would lock a user out after ten navigations. The library's defaults are not
used: they are disabled outside production and would otherwise impose a
hard-coded 3 requests / 10s on sign-in that ignores the configured limits.

**Error handling** — one response envelope, with consistent `400`, `401`, `403`,
`404`, `409`, `429` and `500` handling. Stack traces and database errors are
logged server-side, never returned.

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

**Better Auth's rate limiter is configured, not left at its defaults.** The
library throttles its own endpoints, but an unconfigured limiter is wrong in both
environments: it is disabled outside production, and where it is enabled it
hard-codes 3 requests / 10s on `/sign-in` — oblivious to `RATE_LIMIT_AUTH_*`.
Configuring `rateLimit.customRules` makes our documented variables the single
source of truth and applies them everywhere.

The limits are deliberately two-tier rather than one number for all of
`/api/auth/*`. Credential endpoints need a tight budget, but they share a router
with `/get-session`, which every page load calls. A single auth-wide budget of 10
per minute means ten navigations and the app has locked the user out — a failure
that only shows up under real browsing, not in a test that signs in once. The
default therefore uses the generous `api` budget and `customRules` narrow the
credential paths.

**Integration tests run serially.** They share one MongoDB database. Parallel
files were truncating each other's collections, producing failures that looked
like application bugs. Serial execution is slower and honest.

---

## Troubleshooting

| Symptom                                 | Cause and fix                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_SECRET` missing at boot           | `lib/env.ts` validates on startup. Run `openssl rand -base64 32` and set it.                                                         |
| AI endpoints return `503`               | No `OPENAI_API_KEY` and the fallback is disabled. Set the key, or set `AI_ALLOW_HEURISTIC_FALLBACK=true`.                            |
| `429` while clicking around the app     | You are hitting the `api` bucket, or a window from an earlier test run is still open. Restart the server to clear in-memory windows. |
| `429` on repeated sign-ins              | Expected — the credential bucket. Default is 10 per 60s; tune `RATE_LIMIT_AUTH_*`.                                                   |
| Seed does nothing                       | `SEED_ENABLED` is not `true`, or `NODE_ENV=production`.                                                                              |
| `npm test` fails at connection          | MongoDB is not running. `docker compose up -d`.                                                                                      |
| E2E fails on a fresh checkout           | The app is not running, or `E2E_BASE_URL` points somewhere unreachable.                                                              |
| Duplicate key error on workspace create | `Workspace.slug` is unique. Pick a different name.                                                                                   |

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
