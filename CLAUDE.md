# CLAUDE.md

A single workspace where product teams turn raw input (notes, discovery calls, surveys, tickets) into backlog items that are provably the right thing and Ready to build. It looks like a team notebook. Underneath is a lifecycle nobody can skip.

## Read before any bolt

1. `plans/bolts.md` — the current bolt's scope and done-when
2. `docs/domain.md` — entities, state machine, invariants
3. `docs/decisions.md` — why things are built the way they are
4. The acceptance files named in the bolt
5. `docs/screens.md` and `docs/wireframes/` when the bolt touches UI
6. `docs/ai-teammate.md` when the bolt touches AI

## Stack

- Next.js (App Router) + TypeScript, strict mode
- Tiptap for the notebook editor, with custom nodes for item chips (see ADR-002)
- Postgres via Prisma (`@prisma/adapter-pg`): Supabase in production, local Postgres for dev and tests (ADR-037)
- Anthropic TypeScript SDK, called server-side only. Model from `ANTHROPIC_MODEL` (default `claude-sonnet-5`), key from `ANTHROPIC_API_KEY`
- Vitest for unit tests, Playwright for end-to-end
- Tailwind with the tokens in `docs/screens.md`

## Commands

Set these up in bolt 1 and keep them working:

- `npm run dev` — local app with seed data loaded
- `npm run db:reset` — reset the local database and re-seed from `seed/` (needs local Postgres: `docker compose up -d`)
- `npm test` — unit tests
- `npm run e2e` — Playwright tests
- `npm run lint` and `npm run typecheck`

## Non-negotiable rules

1. **The AI never adds a fact.** Every AI-shaped line carries source references to existing notes or source excerpts. A server-side validator rejects or marks as "unconfirmed" anything without them. Never bypass the validator, including in tests.
2. **Only people take stances.** No code path lets the AI agree, object or sign off.
3. **Floor checks can't be disabled.** Teams can add checks; the floor set in `docs/domain.md` always applies.
4. **Checks are computed, never set.** No boolean "isReady" that someone can flip. Ready is derived from data plus the lead's sign-off.
5. **Editing agreed content reopens it** for the people who agreed, and clears Ready.
6. **Drafts never touch agreed content** until the lead triages them.
7. **The Scrum Master is deterministic code.** Agendas, expiry, reminders and the Ready check are rules, not LLM calls. The LLM may only phrase messages.
8. **Everything is one workspace.** New capabilities go into the left, centre or right column of the existing screen, not onto new pages. If something truly needs its own page, raise it before building.

## Conventions

- Plain, specific UI copy. No emoji, no exclamation marks, no "AI magic" language.
- Visual semantics must match the wireframes: solid = sourced or agreed, dashed = assumed, draft or unconfirmed, blue = agreed or passing, orange = blocking or conflict.
- Domain logic lives in `src/domain/` as pure functions with unit tests. UI never computes checks itself.
- AI calls live in `src/ai/`, each with a typed input, a JSON schema for output, and a validator.
- Keep seed data realistic. Don't replace it with lorem ipsum or tidy placeholder content.

## Workflow

- Start every bolt in plan mode. Propose a plan that maps each step to acceptance scenarios, then wait for approval.
- Write the domain tests for a bolt before the UI.
- Before calling a bolt done, run the `qa-reviewer` and `architect-reviewer` subagents and address what they find.
- Tick the bolt in `plans/bolts.md` and note anything deferred.

## Out of scope for the prototype

Auth, multi-tenancy, a real Jira connection, live call or survey connectors, real-time multi-user editing, mobile layouts, billing. See ADR-003 and ADR-004.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
