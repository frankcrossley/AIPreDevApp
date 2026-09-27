# Pre-dev workspace: prototype spec pack

This pack is everything Claude Code needs to build the prototype, written the way the product itself says specs should be written: an agreed intent, decisions with reasons, a domain model, acceptance criteria that trace to screens, and a build plan in small slices.

## How to use it

1. Create an empty repo and copy this pack into its root. (Done: the pack lives at the root of this repo, next to the app.)
2. **Rewrite `docs/prfaq.md` yourself.** It is a draft from our design conversations. The judgment calls are yours, not Claude's.
3. Review the seed data in `seed/`. Realistic, messy data is what makes design-partner sessions feel real.
4. Open Claude Code in the repo and run `/bolt 1`. It will read the pack, propose a plan in plan mode, and wait for your approval.
5. After each bolt, run the `qa-reviewer` and `architect-reviewer` subagents, fix what they find, commit, and tick the bolt in `plans/bolts.md`.

## What's in here

| Path | What it is |
|---|---|
| `CLAUDE.md` | Project memory: stack, commands, non-negotiable rules, conventions |
| `docs/prfaq.md` | Draft PRFAQ for the product (you own this) |
| `docs/domain.md` | Entities, lifecycle state machine, invariants, how checks are computed |
| `docs/ai-teammate.md` | The Scrum Master and the hats, the structured-output contracts, the "never adds a fact" validator |
| `docs/decisions.md` | Decision records for the key build choices |
| `docs/deploy.md` | Production on Vercel + Supabase: setup, migrations, secrets, rotation |
| `docs/screens.md` | Layout spec for the single workspace, panel contexts, design tokens |
| `docs/acceptance/*.feature` | Acceptance criteria per screen, written as Gherkin |
| `docs/wireframes/` | Wireframe source files from the design canvas (reference only) |
| `plans/bolts.md` | The build order: nine bolts, each with scope and done-when |
| `seed/` | Seed backlog, people, PRFAQ, drafts, a call transcript and a 40-response survey |
| `.claude/agents/` | Two reviewer subagents that mirror the product's QA and Architect hats |
| `.claude/commands/bolt.md` | `/bolt <n>`: starts a bolt the same way every time |

## The one thing to protect

The AI teammate reshapes and challenges human content. It never adds a fact. That promise is enforced in code (see `docs/ai-teammate.md`) and tested in `docs/acceptance/ai-teammate.feature`. If a bolt weakens it, the bolt isn't done.
