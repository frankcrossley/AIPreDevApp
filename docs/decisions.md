# Decision records

Short records of the choices that shape the build. Add new ones as you go: context, decision, consequence.

## ADR-001 · One workspace, three columns
**Context.** People love that Jira keeps an issue in one place. Earlier designs spread the work across trays, gates and separate pages.
**Decision.** One screen: backlog and agenda on the left, the notebook in the middle, and on the right a context panel (decisions needed, talking points, discovery, alignment, details, activity). Epic, story and session are views of the same screen.
**Consequence.** New features go into a column, not onto a new page. The right panel needs strict ranking to stay scannable.

## ADR-002 · Tiptap for the editor
**Context.** A good block editor is expensive to build and isn't the product.
**Decision.** Use Tiptap, with custom nodes for item chips (decision, question, assumption, risk, talking point) and an input rule for each prefix. Map documents to Blocks for citations and checks.
**Consequence.** Editor quality is borrowed. Our effort goes into the lifecycle, checks and AI.

## ADR-003 · Single user, seeded data, no auth
**Context.** The prototype is for design-partner sessions, not production.
**Decision.** No login. A "viewing as" person switcher in the header decides who is acting. Data comes from `seed/`, and `npm run db:reset` restores it.
**Consequence.** Stances and triage can be demoed by switching person. Real-time multi-user editing is deferred.

## ADR-004 · Jira is simulated
**Context.** A real Jira connection costs time and adds nothing to learning whether teams want the workflow.
**Decision.** Import the backlog from `seed/backlog.json`. Export Ready items as JSON and markdown. Simulate the sprint rule with a "Move to sprint" action that refuses items that aren't Ready and shows why. Simulate drift with a seeded Jira-side change you can trigger from a debug menu.
**Consequence.** The enforcement story can be demoed end to end. The real connector comes later.

## ADR-005 · Structured AI output, validated in code
**Context.** "Never adds a fact" is the core promise. Prompts alone can't guarantee it.
**Decision.** Every AI call returns JSON against a schema, with references to input IDs. Server-side validators enforce the rules in `docs/ai-teammate.md` before anything is stored.
**Consequence.** Some AI output is rejected or marked unconfirmed. That's working as intended, and it's measured.

## ADR-006 · The Scrum Master is deterministic
**Context.** Process rules must be predictable and explainable.
**Decision.** Agenda building, expiry, reminders and blocker detection are code. The model may only phrase messages.
**Consequence.** The Scrum Master is fully unit-testable and never surprising.

## ADR-007 · Checks are computed, never stored as flags
**Context.** A stored "Ready" boolean invites someone to flip it.
**Decision.** Check results are computed on read from domain data. Only the lead's sign-off is stored, and it's cleared by any change to agreed content.
**Consequence.** The UI always reflects the truth, and every failing check can point at its fix.

## ADR-008 · Model access is server-side only
**Context.** Keys must not reach the browser.
**Decision.** All model calls go through Next.js route handlers or server actions. The model name comes from `ANTHROPIC_MODEL`, the key from `ANTHROPIC_API_KEY`.
**Consequence.** It's easy to swap models and to add caching or logging later.

## ADR-009 · Domain functions work on an in-memory snapshot
**Context.** Checks, the lifecycle and the Scrum Master must be pure and testable, and must give the same answer in tests, on the server, and against `seed.json`.
**Decision.** Everything in `src/domain/` takes a plain `DomainSnapshot` and never imports Prisma. `src/server/snapshot.ts` loads one from the database; `src/seed/normalise.ts` builds one from `seed.json`. A round-trip test proves the two give identical check results.
**Consequence.** Loading the whole workspace on each read is fine at prototype scale. If it gets slow, load per epic, not per check.

## ADR-010 · List fields are JSON strings in SQLite
**Context.** SQLite has no array columns, and the prototype doesn't need to query inside those lists.
**Decision.** Fields like `memberIds`, `requiredStanceIds` and `refs` are stored as `...Json` text columns. Only `src/server/snapshot.ts` (read) and `prisma/write-snapshot.ts` (seed write) know that.
**Consequence.** Moving to Postgres means changing those two files and the schema, not the domain.

## ADR-011 · How the agenda decides "near Ready"
**Context.** The agenda puts "items one or two checks from Ready, where the missing check needs the room" third. BILL-150 fails four checks, yet the session wireframe places it there, so a literal count doesn't match the design.
**Decision.** An in-refinement or agreed story is near Ready when every failing check is a room check: `stances_complete`, `no_blocking_questions`, `no_unresolved_conflicts`, `arch_questions_answered`, `within_promise_scope`, `team_aligned`. If some gap is desk work (estimate, citations, criteria, mock) but a blocking question is open, it goes under blocking questions. Triaged stories are new items. Stories still in `draft` stay off the agenda until the lead triages them; their drafts still appear under expiring drafts.
**Consequence.** The room only sees items it can move. The rule lives in `ROOM_CHECK_KEYS` in `src/domain/scrum-master.ts`.

## ADR-012 · Stance rounds and resolving objections
**Context.** Editing agreed content must ask everyone who agreed for their stance again, and an `object` must stay blocking until it's resolved.
**Decision.** Each Item has a `stanceRound`. `stances_complete` counts only stances in the current round. Editing agreed content bumps the round for the decisions touched (`reopenOnEdit`). An `object` counts as resolved when the same person records a later stance on the same item: the latest stance per person is the one that counts.
**Consequence.** Earlier rounds stay in the log for the Activity tab. The decider rules (`two_rounds_then_decider`) can build on rounds in bolt 8.

## ADR-013 · Only the lifecycle module writes story state
**Context.** "There is no way to force Ready" has to hold for code added in later bolts, not just today's.
**Decision.** `src/server/lifecycle.ts` is the only code in `src/` that writes Story rows, and it only writes the state and sign-off returned by the domain's `transition`, `signOff` and `reopenOnEdit`. `transition()` refuses `ready` outright; only `signOff()` reaches it. A static test (`tests/domain/no-force-ready.test.ts`) fails the build if anything else writes stories. The seeder writes outside `src/`, in `prisma/`.
**Consequence.** New routes that change a story's state must call the lifecycle module. The sign-off route in bolt 4 adds an API test on top.

## ADR-014 · `db:reset` deletes the local file instead of `prisma migrate reset`
**Context.** Prisma 7 blocks `migrate reset` when run by an AI agent without explicit consent. The prototype database is a throwaway SQLite file that `db:reset` must be able to recreate at any time, including before end-to-end tests.
**Decision.** `scripts/db-reset.ts` deletes the SQLite file (only when it's a `.db` file inside `./prisma`), runs `prisma migrate deploy`, and seeds.
**Consequence.** Same result as a reset for the prototype. It refuses to run against any other database URL.

## ADR-015 · Ready is reached once and left only through a reopen
**Context.** Checks are computed on read (ADR-007), but the lifecycle also stores `state`. The seed has BILL-152 exported while the epic's PRFAQ is still a draft, so its checks fail today.
**Decision.** `ready` is reached only through `signOff()`: the lead, every check passing, and the agreed guard (signing off from `in_refinement` passes through `agreed` in one step). After that, only `reopenOnEdit()` moves the story back. Once a story is agreed, ready or exported, all its content counts as agreed, so any edit to it (or a Jira-side change to a criterion) reopens it and asks everyone who agreed on its decisions again. Checks that start failing on a Ready story without an edit (for example the epic's PRFAQ going back to draft) don't silently revert it; showing that as a warning is a UI question for bolt 4.
**Consequence.** A stored `ready` always had a valid sign-off when it was set. Open question for the seed owner: BILL-152's lead is Dan but it's signed off by Priya.

## ADR-016 · Who owns what blocks Ready
**Context.** The Scrum Master summary names an owner for each blocker, and later bolts (reminders, session parking) build on it.
**Decision.** A missing stance, read-back or an objection belongs to that person. Architect and Engineer hat notes go to the epic's `tech_lead`, Security notes to its `security` member, and Product notes and PRFAQ gaps to the epic owner. An unsourced block goes to its author, a question to its owner, and a missing mock to the epic's `design` member. Everything else goes to the story lead. The rules are in `src/domain/scrum-master.ts`.
**Consequence.** Owners are predictable and explainable. Delegates (who else can triage for a lead) aren't modelled yet.

## ADR-017 · Hat conflicts don't stop people agreeing
**Context.** The in_refinement → agreed guard names stances, objections and blocking questions. Conflict hat notes also fail `no_unresolved_conflicts`.
**Decision.** Agreement only needs people: every required stance in the current round, no unresolved `object`, no open blocking question. Open conflict hat notes still fail Built right, so they block Ready, not agreement.
**Consequence.** Only people take stances (CLAUDE.md rule 2); the AI can hold up Ready with a question but never block agreement.

## ADR-018 · Team checks come from a catalogue; seed conventions
**Context.** "Teams can add checks" needs code behind every check, and the seed leaves some fields implicit.
**Decision.** Team checks are chosen from the definitions in `CHECK_DEFINITIONS` (`src/domain/checks.ts`); new kinds of check are added in code. The seed normaliser infers parent and hat-note target types from ids, assigns read-backs without an `epicId` to the only epic (and refuses with more than one), spaces seeded stances a minute apart to keep their order, and trusts seeded states and sign-offs as they are. The simulated Jira config is stored as a `Setting` row (ADR-004).
**Consequence.** Seed files stay short and readable. A second epic in the seed needs `epicId` on its read-backs.
