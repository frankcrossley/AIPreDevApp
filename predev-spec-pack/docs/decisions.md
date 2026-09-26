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
