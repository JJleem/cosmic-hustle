# Cosmic Hustle Hermes Roadmap

## Final Direction

Cosmic Hustle should become a real local operations dashboard for AI employees.

The long-term shape:

```text
Hermes Agent      = execution engine
Cosmic agents     = employee roles and skills
Obsidian Vault    = shared memory and work wiki
cosmic-hustle/web = local operations dashboard
cosmic-blog       = public blog frontend
cosmic-hustle/backend /api/blog/* = protected blog publishing backend
```

The important decision:

- Keep the blog publishing system intact.
- Replace only the `cosmic-hustle/web` product direction.
- Move agent execution gradually toward Hermes.
- Use Obsidian as the shared source of work knowledge.

## Repository Roles

```text
/Users/carima_mac/Desktop/repository/hermes-agent
  Planning workspace for Hermes, Obsidian, Slack, and agent-system docs.

/Users/carima_mac/Desktop/repository/cosmic-hustle
  Main AI employee system.
  Backend currently owns blog APIs, agent orchestration, wiki APIs, logs, and automation jobs.
  Web should become the local employee operations dashboard.

/Users/carima_mac/Desktop/repository/cosmic-blog
  Public blog frontend.
  It depends on cosmic-hustle backend for /api/blog/*.
```

## Protected Areas

Do not break these while redesigning Cosmic Hustle.

```text
cosmic-hustle/backend/routers/blog.py
cosmic-hustle/backend/blog_generator.py
cosmic-hustle/backend/db/models.py blog tables
cosmic-hustle/backend/alembic/versions/*blog*
cosmic-hustle/backend/static/blog/
cosmic-hustle/backend/main.py blog scheduler jobs
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

Rule:

```text
The blog backend is production infrastructure. Treat it as stable until a separate extraction plan exists.
```

## Changeable Areas

The main allowed redesign target:

```text
cosmic-hustle/web
```

Current role:

```text
Research tool / company simulator UI.
```

New role:

```text
Local operations dashboard for Hermes-powered AI employees.
```

Expected dashboard areas:

- Employee status board.
- Active jobs.
- Waiting approvals.
- Recent Hermes runs.
- Obsidian sync status.
- Blog publishing status.
- System health.
- Manual command launcher.
- Work logs and daily reports.

## Hermes Status

Hermes is installed here:

```bash
~/.local/bin/hermes
```

If `hermes` is not found in a shell:

```bash
source ~/.zprofile
```

Check status:

```bash
hermes status
hermes doctor
```

Known working status from local check:

```text
Provider: OpenAI Codex
Model: gpt-5.5
OpenAI Codex OAuth: logged in
```

## Start From cosmic-hustle

For implementation work, open Codex from:

```text
/Users/carima_mac/Desktop/repository/cosmic-hustle
```

Suggested first prompt:

```text
cosmic-hustle repo를 읽고 현재 backend의 blog 발행 기능은 보호 영역으로 표시하고,
web은 Hermes 직원 관제 대시보드로 전환하는 계획을 세워줘.
먼저 코드 구조와 위험 영역을 분석하고, AGENTS.md나 docs에 보호 규칙을 정리해줘.
```

## First Architecture Step

Before major code changes, add a protection note inside `cosmic-hustle`.

Suggested file:

```text
cosmic-hustle/docs/hermes-dashboard-transition.md
```

Suggested contents:

```text
# Hermes Dashboard Transition

Protected:
- backend /api/blog/*
- blog_generator.py
- blog DB models and migrations
- daily blog scheduler
- cosmic-blog backend contract

Allowed to redesign:
- web UI
- local dashboard routes
- agent status views
- Hermes run views

Goal:
- Keep public blog publishing stable.
- Turn cosmic-hustle/web into a local dashboard for Hermes-powered AI employees.
```

## Agent Migration Strategy

Current agent definitions live here:

```text
cosmic-hustle/backend/agents/*/CLAUDE.md
```

Do not migrate all 11 agents at once.

Phase 1 agents:

```text
plan = project manager and task planner
wiki = Obsidian/wiki curator
run  = code execution and implementation agent
```

Phase 2 agents:

```text
pocke = research
ka    = analysis
fact  = review and validation
```

Phase 3 agents:

```text
over  = writing
buzz  = marketing
pixel = design
root  = devops
ping  = ideas
```

Target loop for Phase 1:

```text
User command
  -> Hermes plan agent creates work plan
  -> Hermes run agent performs local work
  -> Hermes wiki agent writes result to Obsidian
  -> cosmic-hustle/web shows job status and result
```

## Obsidian Vault

Recommended vault structure:

```text
Obsidian Vault/
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

Suggested sections:

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

## Dashboard Concept

First version should be practical, not decorative.

Main screen:

```text
Header:
  Current system status
  Hermes status
  Obsidian status
  Blog scheduler status

Left column:
  Employees
  plan / wiki / run / pocke / ka / fact / over / buzz / pixel / root / ping

Center:
  Active jobs
  Job timeline
  Waiting approvals

Right column:
  Recent Obsidian notes
  Recent blog jobs
  System logs
```

The dashboard should answer:

- Who is working?
- What are they working on?
- What needs approval?
- What changed in Obsidian?
- Is blog publishing healthy?
- What finished today?

## Backend Direction

Short term:

- Keep the existing backend.
- Do not remove the Claude-based orchestration yet.
- Add Hermes integration beside the existing code.
- Let web display Hermes data when available.

Medium term:

- Move project work execution from Claude SDK subprocess calls to Hermes.
- Keep blog generation stable unless deliberately migrated.
- Gradually reduce old research-only flows.

Long term:

- Blog backend may be extracted into its own service only after the API contract is documented and tests exist.
- Hermes becomes the primary agent runtime.
- Obsidian becomes the durable memory layer.

## First Practical Sequence

1. Open `cosmic-hustle` as the Codex workspace.
2. Add transition/protection docs to `cosmic-hustle`.
3. Audit blog backend routes and mark them protected.
4. Audit current `web` pages and identify what can be replaced.
5. Create first dashboard skeleton in `web`.
6. Convert `plan`, `wiki`, and `run` agent docs into Hermes-compatible skills or profiles.
7. Create Obsidian Vault and first project notes.
8. Build a local command flow:

```text
dashboard command
  -> Hermes one-shot or session
  -> result log
  -> Obsidian note update
  -> dashboard refresh
```

9. Add Slack only after the local loop works.

## Do Not Do Yet

- Do not delete `backend`.
- Do not rewrite `/api/blog/*`.
- Do not move `cosmic-blog` backend dependency without a migration plan.
- Do not register all 11 agents into Hermes at once.
- Do not make Slack the first interface.
- Do not make Obsidian optional; it is the shared memory layer.

## Working Principle

The first win is not a beautiful dashboard.

The first win is this loop working reliably:

```text
Give work -> agent runs -> result is saved -> Obsidian is updated -> dashboard shows what happened
```

