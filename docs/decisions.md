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
**Decision.** `src/server/lifecycle.ts` is the only code in `src/` that writes Story rows, and it only writes the state and sign-off returned by the domain's `transition`, `signOff` and `reopenOnEdit`, or a new story built by `newDraftStory` (always `draft`). Other modules that need to reopen a story take `reopenWrites()` from it and put them in their own transaction. `transition()` refuses `ready` outright; only `signOff()` reaches it. A static test (`tests/domain/no-force-ready.test.ts`) fails the build if anything else writes stories. The seeder writes outside `src/`, in `prisma/`.
**Consequence.** New routes that change a story's state must call the lifecycle module. The sign-off route in bolt 4 adds an API test on top.

## ADR-014 · `db:reset` deletes the local file instead of `prisma migrate reset`
**Context.** Prisma 7 blocks `migrate reset` when run by an AI agent without explicit consent. The prototype database is a throwaway SQLite file that `db:reset` must be able to recreate at any time, including before end-to-end tests.
**Decision.** `scripts/db-reset.ts` deletes the SQLite file (only when it's a `.db` file inside `./prisma`), runs `prisma migrate deploy`, and seeds.
**Consequence.** Same result as a reset for the prototype. It refuses to run against any other database URL.

## ADR-015 · Ready is reached once and left only through a reopen
**Context.** Checks are computed on read (ADR-007), but the lifecycle also stores `state`. The seed has BILL-152 exported while the epic's PRFAQ is still a draft, so its checks fail today.
**Decision.** `ready` is reached only through `signOff()`: the lead, every check passing, and the agreed guard (signing off from `in_refinement` passes through `agreed` in one step). After that, only `reopenOnEdit()` moves the story back. Once a story is agreed, ready or exported, all its content counts as agreed, so any change to it (editing, adding or removing a line, marking a question blocking, or a Jira-side change to a criterion) reopens it and asks everyone who agreed on its decisions again. The reopen is written in the same transaction as the change. Checks that start failing on a Ready story without an edit (for example the epic's PRFAQ going back to draft) don't silently revert it; showing that as a warning is a UI question for bolt 4.
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

## ADR-019 · One route for the workspace; "viewing as" is a cookie
**Context.** Selecting an item must change the URL without changing the screen (ADR-001), and actions need to know who is acting without auth (ADR-003).
**Decision.** Every view lives at `/w/[key]`, where the key is a story or an epic. `src/app/w/layout.tsx` renders the header and the backlog and persists across navigation; the page renders the centre and right columns. `/` redirects to the first story. The header's person switcher sets a `viewing-as` cookie through a server action, and `src/server/actor.ts` resolves it, falling back to the first product person.
**Consequence.** Session mode (bolt 8) becomes a state of the same layout, not a route. Every server action records the resolved person.

## ADR-020 · How the notebook maps to Blocks and Items
**Context.** Tiptap edits a document; checks and citations work on Blocks and Items (ADR-002).
**Decision.** Each template section is its own Tiptap editor. Each paragraph is one Block, and carries `blockId`, and when it has a chip, `itemId`, `itemType` and `itemText` (the item's own text when it came from part of the line). The editor assigns ids to new lines and chips, so saves need no id round trip. A section autosaves as a whole list of lines; the pure `diffSection()` in `src/domain/notebook.ts` works out the create, update, delete, archive and restore ops, and `src/server/notebook.ts` writes them with an Event each. If the ops touch agreed content, the server answers "needs confirmation" with the reopen warning instead of saving, and the editor holds further autosaves until the person chooses "Save and reopen" or "Undo my edit". Acceptance criteria are shown read-only until shaping (bolt 6).
**Consequence.** Blocks keep stable ids for citations. The domain decides what changed and what counts as agreed; the editor only reports lines. This amends ADR-002: a chip is a set of attributes on the line's paragraph node (rendered by a React node view), not a separate inline node, so a line carries at most one item. Moving a line between sections is a delete plus a create.

## ADR-021 · Turning an item back into text archives it
**Context.** "Structure can be removed", but the item's history (its stances, who raised it) must survive.
**Decision.** Items get an `archived` status. "Turn back into plain text", deleting a line, or changing a line's chip archives the old item and logs `item.archived`. Undoing the change restores it with its stances, as `open` (its earlier status isn't kept). Checks, the panel and agreement ignore archived and `dropped` items alike.
**Consequence.** Nothing is deleted except Blocks the person removed; their citations go with them.

## ADR-022 · Who is asked for a stance on a new decision
**Context.** A decision needs required stances before it can be agreed. The seeded decision asks Priya, Sam, Marcus and Dan, but a new one has no list.
**Decision.** A new decision asks the story lead, its author and the epic's tech lead. The stance controls in bolt 4 let people change the list.
**Consequence.** New decisions start small; the lead widens them when the decision touches finance or sales.

## ADR-023 · Where notebook edits go
**Context.** `docs/domain.md` calls a Draft "anything added outside a session", yet 02-notebook has people typing straight into the notebook.
**Decision.** Amended by ADR-025 after the product owner's answer: only the story's lead writes to the notebook directly. Everyone else's edits are suggestions, which are drafts. Drafts also arrive from outside the notebook (people's notes, discovery sources, ingestion). Rule 6 applies to all of them.
**Consequence.** Nothing lands in a story without its lead's say-so, and agreed content is still protected by the reopen rule (ADR-015).

## ADR-024 · New stories from "Turn into", and backlog labels
**Context.** "Turn into → Story" needs a lead, template and key, and the backlog needs one label per state.
**Decision.** `newDraftStory` makes a `draft` story in the same epic. Whoever creates it leads it (so they triage it), it uses the template named `story`, its key is one past the highest number in use with the epic's prefix, and its id is the key in lower case. Its first line quotes the selection and cites the line it came from. In the backlog, exported stories are labelled Ready, with their sprint.
**Consequence.** The link from new story to source line survives as a citation. Two people creating stories at the same moment could clash on a key; the database's unique key refuses the second, and they retry.

## ADR-025 · Suggest mode: the lead edits, everyone else suggests
**Context.** The product owner wants edits from people other than the lead to work like Word's suggestions: proposed in place, applied only when approved.
**Decision.** `editsDirectly(person, story)` is true only for the story's lead (bolt 8 adds the scribe in session mode). Anyone else's section save goes through `toSuggestions()`, which compares their lines with the real notebook and turns the difference into Drafts of kind `suggestion`: `add` (a new line after a given line), `edit`, `remove` or `chip`. Each person's pending suggestions are reconciled on every save, so they keep their ids and expiry while the person keeps typing, and anything they take back is `withdrawn`. The author sees their suggestions applied in their own editor, dashed and labelled; the lead and others see them dashed under the line they're about, and in the right panel, with Accept and Reject. Accepting runs the same diff as a direct edit, credited to the author, and goes through the reopen warning when it touches agreed content. Answering a hat note as a non-lead is also a suggestion, and accepting it closes the note. Suggestions expire like any draft.
Suggestions are Drafts rather than their own entity because they need exactly what drafts have: an author, an expiry, lead-only triage, and an archive.
**Consequence.** The 02-notebook scenario "Editing agreed content reopens it" is updated: Dan's edit is a suggestion, and Priya sees the warning when she accepts it. Marking a question blocking and dismissing hat notes are lead-only.

## ADR-026 · Deleting a line others cite
**Context.** Other lines, criteria and items cite lines (Citations to blocks). Deleting a cited line would leave them pointing at nothing.
**Decision.** When a save deletes a line that something cites, the server answers "needs confirmation" with what depends on it. On confirmation, the citations to it are removed in the same transaction, and each dependent gets a `talking_point` item ("Realign: … lost its source …") owned by whoever wrote it, linked to it where it's a line. Their sourcing checks then fail until someone re-sources them.
**Consequence.** Impacts are visible before anyone commits to them, and the realignment is tracked where the team already looks.

## ADR-027 · Prefixes are typed, and can be undone
**Context.** `risk:` or `decision:` can be ordinary words at the start of a line.
**Decision.** Chips come only from the editor: a prefix typed at the start of a line, or "Turn into". Saved or pasted text is never turned into a chip on the server. Backspace straight after the conversion undoes it (Tiptap's `undoInputRule`), leaving the prefix as plain text.
**Consequence.** Like Word's autocorrect, it's easy to escape and never surprising.

## ADR-028 · Triage and panel rules
**Context.** The right panel and triage need rules that the acceptance files leave open.
**Decision.**
- **One plan for every notebook change.** Saving, accepting, merging, answering a hat note and marking a question blocking all go through `planChange()`, so the reopen warning (ADR-015) and the dependent check (ADR-026) always apply, and the change is one transaction.
- **Decisions needed** is exactly what `whatBlocksReady` returns for the story: the panel and the meters can't disagree. Other open items and hat notes are talking points. People's notes and suggestions are talking points; quotes from sources and themes already cited are From discovery.
- **Where accepted notes land.** Quotes go under the first section with a citation to their excerpt; people's notes go under "What we think". Accepted lines are credited to their author; merges to the lead. Merging into an agreed line is offered but disabled, so the lead accepts it as a new line instead. Suggestions can't be merged or moved.
- **Move** works the expiry out again for the new target, and takes the Product hat's suggestion (marks it accepted).
- **Epic drafts** are triaged by the epic owner; accepting them waits for the PRFAQ editor (bolt 5).
- **Hat notes.** An answer is a new line under the line the note is about, and closes the note; a QA note can be added to the page as a question. Only the lead dismisses, and dismissals are logged with hat and kind as a product metric. Hat notes on drafts give hints, not answers.
- **Suggestions** capture adds, edits, removals and chip changes, not reordering. An edit suggestion remembers the line's text, and is refused as stale if the lead changed the line since.
**Consequence.** The rules are pure functions in `src/domain/panel.ts`, `triage.ts` and `suggestions.ts`, with the permissions (`canTriageNow`, `canWithdraw`, `canPutToSession`, `canDismiss`) tested there.

## ADR-029 · The Scrum Master's expiry pass and the manual agenda queue
**Context.** Drafts must leave the panel when they expire, and people want to put things to the next session from the panel.
**Decision.** The expiry pass (`expireDrafts`) runs deterministically whenever the workspace loads, archiving overdue drafts and logging `draft.expired`. Anyone can put an item or hat note that belongs to the story on the next planned session; it's stored in `Session.agenda`. Bolt 8 lists those first, then the computed agenda (ADR-011). The panel summary groups blockers into decisions, answers and other checks, with epic checks as a separate sentence, and counts drafts expiring before the next session (or within three days if none is planned).
**Consequence.** No background job is needed for the prototype. A real deployment would run the same function on a schedule.
