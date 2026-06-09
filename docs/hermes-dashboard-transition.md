# Hermes Dashboard Transition

Cosmic Hustle is moving toward a local operations dashboard for Hermes-powered AI employees.

This transition must keep the public blog publishing system stable while changing the product direction of `web`.

## Goal

Build the first reliable local work loop:

```text
dashboard command
  -> Hermes plan/run/wiki work
  -> result log
  -> Obsidian note update
  -> dashboard refresh
```

The first win is operational reliability, not a full redesign.

## Protected Areas

Treat these as production infrastructure until there is a separate extraction plan with tests.

```text
backend/routers/blog.py
backend/blog_generator.py
backend/db/models.py blog tables
backend/alembic/versions/*blog*
backend/static/blog/
backend/main.py daily blog scheduler jobs
web/app/api/blog/*
cosmic-blog/lib/api.ts
cosmic-blog/lib/backendProxy.ts
```

Protected API contract:

```text
GET    /api/blog/posts
GET    /api/blog/posts/{slug}
POST   /api/blog/generate
POST   /api/blog/posts/{slug}/comments
POST   /api/blog/posts/{slug}/like
POST   /api/blog/posts/{slug}/unlike
POST   /api/blog/posts/{slug}/view
GET    /api/blog/posts/{slug}/vote
POST   /api/blog/posts/{slug}/vote
GET    /api/blog/stats
```

Do not rewrite, remove, rename, or casually refactor these surfaces while building the Hermes dashboard.

## Changeable Areas

Primary redesign target:

```text
web
```

The homepage can become the local operations dashboard. Existing research, wiki, and office routes should be preserved or moved deliberately until their replacements exist.

Known `web` surfaces:

```text
web/app/page.tsx                  current research app shell
web/app/office/page.tsx           existing office scene
web/app/wiki/page.tsx             current wiki UI
web/app/blog-preview/*            blog preview UI, preserve
web/app/api/research/*            current research orchestration proxy
web/app/api/wiki/*                current wiki APIs
web/app/api/blog/*                protected blog proxy/API surface
```

## Dashboard V1 Scope

The first dashboard should answer:

- Who is available or working?
- What jobs are active?
- What is waiting for approval?
- What did Hermes run recently?
- Did Obsidian sync?
- Is blog publishing healthy?
- What changed today?

Suggested panels:

```text
Header: system, Hermes, Obsidian, blog scheduler status
Left: employee status board
Center: active jobs, timeline, approvals
Right: recent notes, recent blog jobs, logs
Footer or command area: manual launcher
```

## Agent Migration

Do not migrate all 11 employees at once.

Phase 1:

```text
plan = task planning
run  = local implementation/execution
wiki = Obsidian/work knowledge update
```

Phase 2:

```text
pocke = research
ka    = analysis
fact  = validation
```

Phase 3:

```text
over  = writing
buzz  = marketing
pixel = design
root  = devops
ping  = ideas
```

Current agent source docs:

```text
backend/agents/*/CLAUDE.md
```

Convert `plan`, `run`, and `wiki` first into Hermes-compatible profiles or skills. Keep the current backend orchestration in place until the local Hermes loop works.

## Obsidian Memory

Obsidian is the shared work memory. It should not be optional in the target system.

Local Vault:

```text
/Users/carima_mac/Desktop/repository/cosmic-hustle-vault
```

Private GitHub sync:

```text
https://github.com/JJleem/cosmic-hustle-vault
```

Recommended vault structure:

```text
knowledge/
projects/
  cosmic-hustle.md
  cosmic-blog.md
  hermes-agent.md
agents/
  plan.md
  wiki.md
  run.md
reports/
logs/
inbox/
```

First project note:

```text
projects/cosmic-hustle.md
```

Minimum sections:

```text
# Cosmic Hustle

## Goal
Turn Cosmic Hustle into a local AI employee operations dashboard powered by Hermes.

## Protected
- Blog backend
- Blog API contract
- Blog scheduler
- cosmic-blog frontend contract

## Current Focus
- Move web toward operations dashboard.
- Register first Hermes agents: plan, wiki, run.
- Build command -> work -> note -> dashboard loop.

## Decisions
- Blog publishing remains stable.
- web can be redesigned.
- Hermes is execution engine.
- Obsidian is shared memory.
```

## Practical Sequence

1. Keep this protection note current.
2. Preserve blog backend and `web/app/api/blog/*`.
3. Add a dashboard shell to `web` without deleting old workflows.
4. Add read-only local status checks for Hermes, Obsidian, blog scheduler, and backend health.
5. Register or model the first three Hermes employees: `plan`, `run`, `wiki`.
6. Build a single command-to-result local loop.
7. Write the result into Obsidian.
8. Surface the job and note update in the dashboard.
9. Add Slack or broader automation only after the local loop is reliable.

## Do Not Do Yet

- Do not delete `backend`.
- Do not rewrite `/api/blog/*`.
- Do not remove `web/app/api/blog/*`.
- Do not move the `cosmic-blog` backend dependency without a migration plan.
- Do not register all 11 employees into Hermes at once.
- Do not make Slack the first interface.
- Do not treat Obsidian as optional.
