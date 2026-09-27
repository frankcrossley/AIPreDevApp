# Build plan: nine bolts

One bolt per session. Each one has a demo you could show a design partner. Start with `/bolt <n>`.

Every bolt is done when:
- its acceptance scenarios pass, as unit tests for domain rules and Playwright tests for UI;
- `qa-reviewer` and `architect-reviewer` have no unresolved findings;
- lint, typecheck and all tests pass;
- it's committed, ticked here, and anything deferred is noted.

---

## [x] Bolt 1 · Domain, lifecycle, checks, seed
**Goal.** The rules exist and are proven before there's any UI.
**Scope.**
- Next.js scaffold, Prisma schema from `docs/domain.md`, and the seeder with relative dates.
- `src/domain/`: the lifecycle state machine, draft expiry, `evaluateBuiltRight`, `evaluateRightThing`, `evaluatePrfaqAgreement`.
- The Scrum Master's pure functions: the "what blocks Ready" summary and agenda building.
- npm scripts from CLAUDE.md.
**Acceptance.**
- `04-checks.feature`, domain scenarios only.
- `08-session.feature`, the agenda scenario, as a unit test.
- `seed._expected` reproduced exactly by tests.
- The "no way to force Ready" test.
**Demo.** `npm test` shows BILL-150 at Right thing 4 of 5 and Built right 5 of 8, with reasons.
**Done.** `npm test` prints BILL-150's report (also `npm run checks`). ADR-009 to ADR-018 record the choices made.
**Deferred.**
- The API route test for "no way to force Ready" comes with the sign-off route in bolt 4. The state machine test and a static guard on story writes are in place.
- The UI steps of `04-checks.feature` (clicking a failing line, the template editor, the sign-off button) are bolt 4.
- Triage by a delegate isn't modelled; only the lead can triage.
- Nothing runs `expireDrafts` on a schedule yet. The Scrum Master calls it once the right panel exists (bolt 3).
- Seed question for the seed owner: BILL-152 is exported and signed off by Priya, but its lead is Dan and its checks now fail because the PRFAQ is a draft (ADR-015).

## [x] Bolt 2 · The single workspace and the notebook
**Goal.** The three-column screen, with a real editor.
**Scope.**
- Header with the "viewing as" switcher.
- Left backlog tree with states and meters.
- Centre story notebook in Tiptap, with template sections and chip nodes plus prefix input rules.
- Blocks persist, and editing agreed content reopens it.
- Epic view placeholder.
**Acceptance.** `01-workspace.feature` and `02-notebook.feature`.
**Demo.** Type `? What about downgrades` and watch it become a question chip. Edit the agreed decision and see the reopen warning.
**Done.** Workspace at `/w/[key]`, Tiptap notebook with chips, Turn into, blocking, and the reopen warning, which also covers new lines on Agreed or Ready stories. ADR-019 to ADR-024.
**Deferred.**
- 01 "Switching who I'm acting as": authorship of lines and items is recorded as the viewing-as person and tested. Stances, triage and read-backs use the same `currentActorId()` but have no UI until bolts 3 to 5, so that part of the scenario is proven then.
- Header search, and hat notes under their lines (bolt 6).
- Open questions: should notebook edits by non-leads outside a session become drafts (ADR-023)? Should deleting a line that others cite be refused, rather than removing its citations? Should a prefix be escapable, so "risk: ..." can stay plain text?

## [x] Bolt 3 · The right panel
**Goal.** Everything that needs you, beside the notebook.
**Scope.**
- The "For this item" tab: Scrum Master summary, Decisions needed, Talking points, From discovery.
- Draft cards with expiry, and lead-only triage (accept, merge, reject, move).
- An expired-draft archive under Activity.
- Details and Activity tabs.
**Acceptance.** `03-right-panel.feature`.
**Demo.** As Sam you can't triage; as Priya, accept Marcus's draft and see it land as an unagreed block.
**Done.** Ranked panel with the Scrum Master summary, draft triage, the expired-draft archive, and the Product-hat move. It also includes the product owner's answers from bolt 2: suggest mode (ADR-025), dependent-aware deletes (ADR-026), and typed-only prefixes (ADR-027). ADR-028 and ADR-029 record the rest.
**Deferred.**
- Stances ("Decide now" only scrolls to the decision) are bolt 4.
- Epic drafts can be rejected or moved, but accepting them waits for the PRFAQ editor (bolt 5).
- The scribe editing directly in session mode, and using the manual agenda queue, are bolt 8.
- Hat notes are seeded; generating them and validating their hints (including `moveToId`) is bolt 6.
- Delegates for triage aren't modelled.

## [x] Bolt 4 · Checks in the UI, stances and sign-off
**Goal.** Ready is earned in the interface.
**Scope.**
- Meters under the title, and the checks view with `fixTarget` links.
- Stance controls on decisions, with reasons required for objections.
- Lead sign-off, a template editor that locks floor checks, and the state pill.
**Acceptance.** `04-checks.feature`, all scenarios.
**Demo.** Take BILL-150 from 5 of 8 to Ready by answering the question, getting Dan's stance and answering the Architect.
**Done.** Checks view with linked failing lines, stance controls, "Who's asked", answering questions, lead sign-off (UI and `POST /api/stories/:key/sign-off`), the template editor, and the state pill with drift. ADR-030 to ADR-033.
**Deferred.**
- The demo's last Right thing check (the PRFAQ agreed) is bolt 5; until then the demo and e2e set it in the database.
- Stance round rules for disagreement (`two_rounds_then_decider`) and silence (`remind_once_then_owner_decides`) are bolt 8.
- Exporting a Ready story whose checks have since drifted is a bolt 9 question.
- The 04 scenario's link text now reads "No blocking questions · downgrade mid-cycle", the subject the rules produce.

## [x] Bolt 5 · PRFAQ and alignment
**Goal.** Building the right thing is visible and gated.
**Scope.**
- The epic centre as an editable PRFAQ, with a customer quote chosen from excerpts, promises and FAQ entries linked to stories.
- The Alignment tab: read-backs (the model call is stubbed here and swapped for real in bolt 6), `too_close` similarity in code, promise coverage, evidence against.
- "Agree the PRFAQ" gating `team_aligned`.
**Acceptance.** `05-prfaq-alignment.feature`.
**Demo.** Dan's read-back is flagged. Fix the flat-fee FAQ, realign, agree, and watch BILL-150's Right thing pass.
**Done.** Editable PRFAQ, a real customer quote, FAQ links to stories, read-backs with too-close decided in code, Talk it through, evidence against, the three ways out for stories with no promise, and "Agree the PRFAQ" gating `team_aligned`. The bolt 4 demo now reaches Ready entirely in the interface. ADR-034 to ADR-036.
**Deferred.**
- Read-back assessment beyond too-close is a stand-in rule until the model in bolt 6.
- Adding new FAQ entries (editing existing ones works) and deleting promises.

## [ ] Bolt 6 · The AI teammate
**Goal.** Real reshaping and challenges, with the promise enforced in code.
**Scope.**
- `src/ai/`: `shapeStory`, `hatReview`, `assessReadBack`, each with a schema and a validator.
- The Shaped view (Notes, Side by side, Shaped).
- Hat notes inline and in the panel, with caps, ranking and `@hat` mentions.
- Team settings for hat volume.
- Validation events logged.
**Acceptance.** `06-ai-teammate.feature`. Include tests that feed the validators hand-written bad model output.
**Demo.** Shape BILL-150, see every line traced, see QA's line dashed until confirmed. Show a planted invented number being caught.

## [ ] Bolt 7 · Ingestion
**Goal.** Outside content comes in as drafts.
**Scope.**
- A "+ Add source" modal taking a transcript file or pasted text, or a survey CSV.
- `extractCandidates` and `themeSurvey`, with validators, and counts computed in code.
- Send selected candidates to targets as drafts.
**Acceptance.** `07-ingestion.feature`.
**Demo.** Upload the Acme call and the survey. Seven drafts appear on the right items, and the flat-fee theme is shown too.

## [ ] Bolt 8 · Session mode
**Goal.** The same screen, in the room.
**Scope.**
- Start and end session.
- The agenda in the left column, timeboxes, and the stance round.
- Capture text from the scribe.
- Unreached points become async talking points with an owner and due date.
- Hats quiet in session mode.
**Acceptance.** `08-session.feature`.
**Demo.** Run a 10-minute mock refinement on BILL-150 and end with it Ready.

## [ ] Bolt 9 · Ready in Jira (simulated)
**Goal.** The enforcement story, end to end.
**Scope.**
- Export Ready stories to JSON and markdown.
- The "Move to sprint" refusal.
- The drift simulation from the debug menu, with pull-in and revert.
**Acceptance.** `09-export.feature`.
**Demo.** Export BILL-150, get refused moving BILL-160 into a sprint, trigger drift on BILL-152.

---

## After bolt 9

- Run a scripted walkthrough with two or three design partners, using their own anonymised backlog.
- Measure: how many items reach Ready in one session, how many hat notes are dismissed versus accepted, and validator rejection rates.
- Then decide: real Jira or Azure DevOps first, real-time collaboration, auth.
