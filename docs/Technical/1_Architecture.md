# Ownlevel — Architecture & Database Schema

Oct 28, 2026 · @Prakash

## At a glance

Ownlevel is a TypeScript modular monolith on PostgreSQL and Redis, with hierarchical multi-tenancy (agency → client) enforced by row-level security. It ships as one codebase that runs as a single `docker compose` for self-hosters and scales horizontally for the managed cloud. Authentication and authorization are specified in the companion doc *Ownlevel — Authentication & Authorization*.

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (Node 22+ or Bun) | One language across API, dashboard, funnel builder and workflow nodes; AI SDKs are TS-first |
| API | Fastify or Hono | Fast, lightweight; module boundaries enforced by folders and lint rules |
| Database | PostgreSQL 17/18 | RLS, JSONB custom fields, full-text search, pgvector, LISTEN/NOTIFY |
| Query layer | Drizzle or Kysely | Typed, close to SQL, easy `SET LOCAL` per transaction |
| Pooling | PgBouncer (transaction mode) | Thousands of app connections on a small Postgres |
| Cache and queues | Redis + BullMQ | Permission cache, sessions, workflow delays, webhooks, rate limits |
| Dashboard | React + Vite SPA (TanStack Router/Query) | No SSR needed behind login |
| Public pages | Separate SSR renderer behind a CDN | Funnels and sites get SEO and isolation from dashboard load |
| Realtime | WebSockets; Centrifugo later | Inbox and notifications |
| Files | S3-compatible (R2, Hetzner, MinIO) | Cheap egress; self-host friendly |
| Hosting | Hetzner + Cloudflare | Low cost per CPU and RAM |

## Architecture

&#91;embedded content: system architecture · 4 entry points, 3 stores\]

Cloudflare maps each hostname to an agency; the API, renderer, MCP server and workers are one codebase deployed as four processes, all reading tenant data from Postgres through RLS.

## Tenancy and isolation

All tenants share one database and one schema. Every tenant-owned row carries `agency_id` and `client_id`, and Postgres RLS filters rows by the ids set at the start of each transaction.

| Option | Verdict |
| --- | --- |
| Shared schema + `client_id` + RLS | Default. Scales to hundreds of thousands of clients; one migration path |
| Schema per tenant | Rejected. Migrations and pools break down at thousands of clients |
| Database per agency | Enterprise tier only ("dedicated database"); same schema, different connection |

**Rules for every module table**

- Columns `agency_id uuid not null` and `client_id uuid not null` (agency-level tables have `agency_id` only).
- Composite indexes lead with `client_id`.
- RLS enabled and forced; the app role is not the table owner and has no `BYPASSRLS`.

```sql
-- the app connects as a non-owner role
create role app_user nologin;

-- helper functions read the per-transaction settings
create function app_agency_id() returns uuid language sql stable as
  $$ select nullif(current_setting('app.agency_id', true), '')::uuid $$;
create function app_client_id() returns uuid language sql stable as
  $$ select nullif(current_setting('app.client_id', true), '')::uuid $$;

-- client-scoped table: client context sees its rows; agency context sees all its clients
alter table contacts enable row level security;
alter table contacts force row level security;

create policy contacts_tenant on contacts
  using (
    agency_id = app_agency_id()
    and (app_client_id() is null or client_id = app_client_id())
  )
  with check (
    agency_id = app_agency_id() and client_id = app_client_id()
  );
```

The app sets context inside every transaction, never per connection, so PgBouncer cannot leak it between requests:

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`select set_config('app.agency_id', ${ctx.agencyId}, true),
                              set_config('app.client_id', ${ctx.clientId ?? ''}, true)`);
  return handler(tx);
});
```

**As implemented** (`packages/core/src/db/tenant.ts`, migration `0003_rls.sql`): `withTenant(db, ctx, fn)` opens a transaction, sets `app.agency_id`, `app.client_id`, `app.user_id`, `app.host` and `app.slug` with `set_config(..., true)`, then runs `SET LOCAL ROLE app_user`. Policies read these through `app_agency_id()` and friends, and every table is `FORCE`d, so even the owner is filtered. Two narrow, read-only contexts exist for the moments before a tenant is known: `host` (exposes only the one active `agency_domains` row for that hostname, and its agency) and `slug` (availability check). A person can read their own `memberships` across agencies through `user_id`. System roles (`agency_id IS NULL`) are seeded by the migration; the app never writes them. Tested in `apps/api/test/rls.test.ts`.

Agency context (no `client_id`) reads across the clients the user may reach; the app layer still narrows to assigned clients for `assigned` memberships. Writes always require a `client_id`.

## Core schema

The core owns tenancy, roles, modules and entitlements; every module depends on it and nothing in the core depends on a module. Identity tables (`users`, `memberships`, `sessions`, `auth_policies`, `apps`, `app_installations`, `api_keys`, `audit_log`) are defined in the auth doc.

```sql
create extension if not exists citext;
create extension if not exists pgcrypto;

-- ── Tenancy ──
create table agencies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          citext unique not null,          -- slug.ownlevel.app
  branding      jsonb not null default '{}',     -- logo, colors, app name, client label
  plan_id       uuid references plans(id),       -- Ownlevel's plan for the agency
  status        text not null default 'active',  -- active | suspended | cancelled
  created_at    timestamptz not null default now()
);

create table agency_domains (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references agencies(id) on delete cascade,
  hostname     citext unique not null,           -- app.youragency.com
  purpose      text not null check (purpose in ('app','funnels','email')),
  verified_at  timestamptz,
  tls_status   text
);

create table clients (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies(id) on delete cascade,
  name        text not null,
  timezone    text not null default 'UTC',
  currency    char(3) not null default 'USD',
  settings    jsonb not null default '{}',
  client_plan_id uuid references client_plans(id), -- agency's resale plan
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);
create index on clients (agency_id);

-- ── Roles and permissions ──
create table permissions (
  key         text primary key,                  -- crm:contacts.read
  module_key  text not null references modules(key),
  description text
);

create table roles (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid references agencies(id),       -- NULL = system role
  level      text not null check (level in ('agency','client')),
  key        text not null,                      -- agency_admin, client_user, custom...
  name       text not null,
  unique nulls not distinct (agency_id, key)
);

create table role_permissions (
  role_id        uuid references roles(id) on delete cascade,
  permission_key text references permissions(key),
  primary key (role_id, permission_key)
);

-- ── Modules and entitlements ──
create table modules (
  key          text primary key,                 -- crm, conversations, calendars...
  name         text not null,
  version      text not null,
  default_limits jsonb not null default '{}'
);

create table client_plans (                      -- "SaaS mode": agency resells plans
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies(id) on delete cascade,
  name        text not null,
  modules     jsonb not null,                    -- {"crm":{"limits":{...}}, ...}
  price_cents int,
  interval    text
);

create table client_modules (
  client_id   uuid references clients(id) on delete cascade,
  module_key  text references modules(key),
  enabled     boolean not null default true,
  limits      jsonb not null default '{}',       -- overrides plan limits
  primary key (client_id, module_key)
);

-- ── Usage and billing ──
create table plans (                             -- Ownlevel's plans for agencies
  id    uuid primary key default gen_random_uuid(),
  key   text unique not null,
  name  text not null,
  limits jsonb not null
);

create table usage_events (
  id         bigint generated always as identity primary key,
  agency_id  uuid not null,
  client_id  uuid,
  meter      text not null,                      -- sms.sent, email.sent, ai.tokens
  quantity   numeric not null,
  unit_cost_micros bigint,
  occurred_at timestamptz not null default now()
);
create index on usage_events (agency_id, client_id, occurred_at);
```

In practice create `modules` and `plans` first; the order above groups tables by purpose.

## Modules

Each module is a bounded context in one deployable: it owns its tables, exposes a typed service interface, and talks to other modules only through that interface or through events.

```
/core       tenancy, auth, roles, entitlements, events, audit, files, billing
/modules
  /crm            contacts, companies, custom fields, pipelines, opportunities
  /conversations  inbox, SMS, email, WhatsApp, web chat
  /calendars      calendars, availability, appointments
  /funnels        sites, pages, forms
  /workflows      triggers, steps, runs
  /payments       products, invoices, subscriptions
  /ai-agents      agents, knowledge, tool calls
/apps
  api  worker  renderer  web
```

Every module registers a manifest; the UI builds navigation from it, filtered by `client_modules` and the user's permissions:

```ts
export const crmModule = defineModule({
  key: 'crm',
  permissions: ['crm:contacts.read', 'crm:contacts.write', 'crm:pipelines.manage'],
  events: ['contact.created', 'contact.updated', 'opportunity.stage_changed'],
  nav: [{ label: 'Contacts', path: 'contacts', permission: 'crm:contacts.read' }],
  settingsSchema: CrmSettings,          // zod
  exportConfig, importConfig,           // snapshots
});
```

**CRM**

```sql
create table contacts (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null,
  client_id   uuid not null references clients(id) on delete cascade,
  first_name  text,
  last_name   text,
  email       citext,
  phone_e164  text,
  owner_user_id uuid references users(id),
  source      text,
  tags        text[] not null default '{}',
  custom      jsonb not null default '{}',     -- values keyed by custom_fields.key
  dnd         jsonb not null default '{}',     -- per-channel do-not-disturb
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index on contacts (client_id, email) where email is not null and deleted_at is null;
create index on contacts (client_id, phone_e164);
create index on contacts using gin (client_id, tags);  -- needs btree_gin
create index on contacts using gin (custom jsonb_path_ops);

create table custom_fields (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null,
  client_id  uuid not null references clients(id) on delete cascade,
  object     text not null,                     -- contact | opportunity
  key        text not null,
  label      text not null,
  type       text not null,                     -- text, number, date, select, multiselect
  options    jsonb,
  unique (client_id, object, key)
);

create table pipelines (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null,
  client_id  uuid not null references clients(id) on delete cascade,
  name       text not null
);

create table pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null,
  client_id   uuid not null,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name        text not null,
  position    int not null
);

create table opportunities (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null,
  client_id   uuid not null references clients(id) on delete cascade,
  contact_id  uuid not null references contacts(id),
  pipeline_id uuid not null references pipelines(id),
  stage_id    uuid not null references pipeline_stages(id),
  name        text not null,
  value_cents bigint,
  status      text not null default 'open',    -- open | won | lost | abandoned
  owner_user_id uuid references users(id),
  custom      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on opportunities (client_id, pipeline_id, stage_id);
```

**Conversations**

```sql
create table channels (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null,
  client_id  uuid not null references clients(id) on delete cascade,
  kind       text not null,             -- sms, email, whatsapp, webchat
  provider   text not null,             -- twilio, ses, meta...
  config     jsonb not null,            -- secrets stored by reference, not inline
  address    text                       -- phone number, inbox address
);

create table conversations (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null,
  client_id       uuid not null references clients(id) on delete cascade,
  contact_id      uuid not null references contacts(id),
  assigned_user_id uuid references users(id),
  status          text not null default 'open',
  unread_count    int not null default 0,
  last_message_at timestamptz
);
create index on conversations (client_id, status, last_message_at desc);

create table messages (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null,
  client_id        uuid not null,
  conversation_id  uuid not null references conversations(id) on delete cascade,
  channel_id       uuid references channels(id),
  direction        text not null check (direction in ('in','out')),
  body             text,
  attachments      jsonb not null default '[]',
  provider_msg_id  text,
  status           text,                -- queued, sent, delivered, failed, read
  sent_by_user_id  uuid,
  sent_by_installation_id uuid,         -- AI agent or app
  created_at       timestamptz not null default now()
);
create index on messages (conversation_id, created_at);
```

**Calendars**

```sql
create table calendars (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null,
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  slug        text not null,
  duration_min int not null default 30,
  availability jsonb not null,         -- weekly rules, buffers, limits
  team_user_ids uuid[] not null default '{}',
  unique (client_id, slug)
);

create table appointments (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null,
  client_id    uuid not null references clients(id) on delete cascade,
  calendar_id  uuid not null references calendars(id),
  contact_id   uuid not null references contacts(id),
  assigned_user_id uuid references users(id),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'booked',  -- booked, confirmed, cancelled, no_show
  external_event_id text                        -- Google/Outlook sync
);
create index on appointments (client_id, calendar_id, starts_at);
```

**Workflows**

```sql
create table workflows (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null,
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  status      text not null default 'draft',   -- draft | published | paused
  trigger     jsonb not null,                   -- {"event":"contact.created","filters":[...]}
  definition  jsonb not null,                   -- graph of steps
  version     int not null default 1
);

create table workflow_runs (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null,
  client_id    uuid not null,
  workflow_id  uuid not null references workflows(id),
  workflow_version int not null,
  contact_id   uuid references contacts(id),
  status       text not null,                   -- running, waiting, completed, failed
  current_step text,
  resume_at    timestamptz,                     -- for "wait 2 days" steps
  context      jsonb not null default '{}',
  started_at   timestamptz not null default now()
);
create index on workflow_runs (status, resume_at) where status = 'waiting';

create table workflow_step_logs (
  id        bigint generated always as identity primary key,
  run_id    uuid not null references workflow_runs(id) on delete cascade,
  client_id uuid not null,
  step_id   text not null,
  outcome   text not null,
  detail    jsonb,
  at        timestamptz not null default now()
);
```

Every table above gets the RLS policy from the tenancy section. Funnels, payments and AI agents follow the same pattern.

## Events, jobs and webhooks

Modules publish domain events through a transactional outbox, so an event exists only if its data change committed. A relay moves outbox rows into BullMQ queues; the workflow engine, webhooks, search indexing and realtime updates all consume from there.

```sql
create table outbox_events (
  id           bigint generated always as identity primary key,
  agency_id    uuid not null,
  client_id    uuid,
  type         text not null,             -- contact.created
  aggregate_id uuid,
  payload      jsonb not null,
  actor        jsonb,                     -- {user, installation, impersonator}
  created_at   timestamptz not null default now(),
  published_at timestamptz
);
create index on outbox_events (id) where published_at is null;

create table webhook_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null,
  client_id       uuid,                   -- NULL = all clients of the agency
  installation_id uuid references app_installations(id),
  url             text not null,
  event_types     text[] not null,
  secret_enc      bytea not null,         -- HMAC signing secret
  active          boolean not null default true
);

create table webhook_deliveries (
  id              bigint generated always as identity primary key,
  subscription_id uuid not null references webhook_subscriptions(id) on delete cascade,
  event_id        bigint not null,
  attempt         int not null default 0,
  status          text not null,          -- pending, delivered, failed, dead
  response_code   int,
  next_attempt_at timestamptz,
  created_at      timestamptz not null default now()
);
```

**Rules for jobs**

- Every job payload carries `agency_id`, `client_id` and the actor; the worker sets the RLS settings before touching data.
- Queues are partitioned by kind (`workflows`, `messages`, `webhooks`, `imports`) so a bulk import never delays an SMS.
- Rate limits per client and per agency on outbound channels; usage is metered into `usage_events`.
- Waiting workflow steps store `resume_at`; a scheduler enqueues due runs, so long waits don't sit in Redis memory.

## Snapshots

A snapshot is a portable copy of a client's configuration (pipelines, custom fields, calendars, workflows, funnels, templates), never its contacts or messages. Agencies use them to launch a new client fully set up in one step.

```sql
create table snapshots (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agencies(id) on delete cascade,
  source_client_id uuid references clients(id),
  name           text not null,
  modules        text[] not null,          -- which modules are included
  document       jsonb not null,           -- { module_key: exported config }
  format_version int not null,
  created_by     uuid not null references users(id),
  created_at     timestamptz not null default now()
);

create table snapshot_imports (
  id            uuid primary key default gen_random_uuid(),
  snapshot_id   uuid not null references snapshots(id),
  target_client_id uuid not null references clients(id),
  status        text not null,             -- running, completed, failed
  id_map        jsonb,                     -- old id → new id, for re-linking
  started_at    timestamptz not null default now()
);
```

**Module contract:** `exportConfig(clientId)` returns plain JSON with local references (`"stage_ref": "s1"`) instead of database ids; `importConfig(clientId, doc, idMap)` creates rows and records new ids in the map. Modules import in dependency order (CRM before workflows, since workflows reference pipelines and fields). Because each module owns its export, adding a module never means rewriting the snapshot system.

## Scaling path

Start with one app server and one Postgres server; add pieces only when a specific limit shows up.

| Add | When | Note |
| --- | --- | --- |
| Separate worker servers | Workflow or message jobs slow the API | Same codebase, different entry point |
| Postgres read replica | Reports and dashboards load the primary | Route agency-wide reporting reads to it |
| Table partitioning | `messages`, `workflow_step_logs`, `usage_events`, `audit_log` grow large | Partition by month; drop or archive old partitions |
| ClickHouse | Analytics on opens, clicks, page views gets slow | Feed it from the outbox |
| Meilisearch or Typesense | Postgres full-text search is not enough for contact/inbox search | Index per client or filter by `client_id` |
| Centrifugo | WebSocket connections strain Node | Single binary, cheap |
| Go workers | Node memory per worker becomes a cost issue | Only for hot paths: senders, webhook dispatch |
| Citus or DB per agency | One primary can't keep up, or enterprise asks for isolation | `agency_id` on every row keeps this open |

Hono, Drizzle, better-auth
