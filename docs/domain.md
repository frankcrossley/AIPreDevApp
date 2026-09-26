# Domain model

## Entities

| Entity | Key fields | Notes |
|---|---|---|
| **Person** | id, name, role (`product`, `finance`, `sales`, `tech_lead`, `design`, `security`, `head_of_product`, `scribe`) | Seeded. No auth in the prototype. |
| **Template** | id, name (`story`, `big_change`, `small_change`, `bug`), sections[], requiredSections[], teamCheckKeys[], requiresPrfaq, draftExpiryDays, silenceRule, disagreementRule | `requiredSections` feed `claims_sourced` (defaults to all sections). Editable by the team. Cannot remove floor checks. |
| **Epic** | id, key (`BILL-142`), title, ownerId, deciderId, templateId, memberIds[] | Owns a PRFAQ when its template requires one. |
| **Story** | id, key, epicId, title, leadId, templateId, state, promiseId, estimate, hasUiChange, mockUri, jiraKey, sprint, signedOffBy, signedOffAt | `state` follows the lifecycle below. |
| **Block** | id, parentType (`story`, `epic`), parentId, section, order, text, authorId, createdAt, updatedAt | A line or paragraph in the notebook. Tiptap content maps to blocks. |
| **Item** | id, parentType, parentId, blockId, type (`decision`, `question`, `assumption`, `risk`, `talking_point`, custom), text, status, ownerId, blocking, requiredStanceIds[], stanceRound, citations[] | Created with a chip prefix (`decision:`, `?`, `assume:`, `risk:`) or by selecting text. Can be turned back into plain text. |
| **Stance** | id, itemId, personId, value (`agree`, `concern`, `object`), reason, round, createdAt | People only. `object` requires a reason. |
| **Source** | id, kind (`call`, `survey`, `ticket`, `doc`, `chat`, `code`, `adr`), title, date, uri | Imported or seeded. |
| **Excerpt** | id, sourceId, text, locator (timestamp, line or row), kind (`quote`, `theme`), note | The unit you cite. Quoted text must be an exact substring of the source. |
| **Citation** | id, fromType (`block`, `item`, `criterion`, `promise`), fromId, toType (`block`, `excerpt`), toId | Every sourced claim resolves through a citation. The `citations[]` on other entities are these rows, not stored fields. |
| **Draft** | id, targetType, targetId (nullable), text, authorId, excerptId or sourceId, createdAt, expiresAt, status (`pending`, `accepted`, `merged`, `rejected`, `expired`), triagedBy, triagedAt, resultBlockId | Anything added outside a session. |
| **HatNote** | id, hat (`qa`, `arch`, `eng`, `sec`, `pm`), targetType, targetId, kind (`challenge`, `gap`, `conflict`, `suggestion`), text, refs[], status (`open`, `accepted`, `dismissed`) | Challenges, shown in context and in the right panel. |
| **Criterion** | id, storyId, given, when, then, citations[], origin (`notes`, `hat`), hat, confirmedBy | Acceptance criteria. A criterion with `origin: hat` must be confirmed by a person. |
| **Prfaq** | id, epicId, headline, subhead, problem, whatChanges, customerQuoteExcerptId, successMeasure, state (`draft`, `agreed`) | One per epic whose template requires it. |
| **Promise** | id, prfaqId, text | A customer-facing promise. Each story serves one. |
| **FaqEntry** | id, prfaqId, audience (`customer`, `internal`), question, answer (nullable), storyIds[], blocking | An unanswered blocking internal FAQ blocks agreement. |
| **ReadBack** | id, epicId, personId, text, assessment (`pending`, `matches`, `diverges`, `too_close`), note, createdAt | One line per member: what we're building, and why. |
| **CheckDefinition** | key, scope (`right_thing`, `built_right`), tier (`floor`, `team`), label, appliesTo | The floor set is below. |
| **Session** | id, date, lengthMinutes, attendeeIds[], agenda[], status (`planned`, `live`, `ended`), captureText | A refinement session. |
| **Event** | id, type, actorId, subjectType, subjectId, payload, createdAt | Activity log. Everything is auditable. |
| **Setting** | key, value | Workspace settings, e.g. the simulated Jira config (ADR-004). |

## Story lifecycle

`draft` → `triaged` → `in_refinement` → `agreed` → `ready` → `exported`, with a path back to `in_refinement`.

| Transition | Guard |
|---|---|
| draft → triaged | The lead triages it. |
| triaged → in_refinement | It has a template, and has been added to a session agenda or opened for async work. |
| in_refinement → agreed | Every decision has all required stances, no `object` is unresolved, and no blocking question is open. |
| agreed → ready | Right thing passes, Built right passes, and the lead signs off. Signing off from `in_refinement` passes through `agreed`, so its guard must hold too (ADR-015). |
| ready → exported | The export succeeds. |
| agreed, ready or exported → in_refinement | Any edit to agreed content, or a detected Jira-side change to the criteria. This clears the sign-off and asks everyone who agreed for their stance again. |

## Draft rules

- `expiresAt` is whichever comes first: `createdAt + template.draftExpiryDays` (default 10), or the start of the next session.
- Expired drafts are archived, never deleted, and can be restored.
- Accepting a draft creates a Block or Item on the target, marked as unagreed. It never edits agreed content directly.
- Only the target's lead, or a delegate, can triage.

## Floor checks (cannot be removed)

**Built right (story)**
- `no_blocking_questions`: no open Item with `type = question` and `blocking = true`.
- `no_unresolved_conflicts`: no open HatNote with `kind = conflict`, and no `object` stance without a later resolution.
- `stances_complete`: every decision has a stance from every person in its `requiredStanceIds`.
- `claims_sourced`: every Block in a required section has a Citation, or is linked to an `assumption` Item with an owner.
- `criteria_traced`: there is at least one Criterion; every Criterion has Citations; every Criterion with `origin = hat` has been confirmed.

**Right thing (story, inherited from the epic)**
- `serves_promise`: `promiseId` is set and the promise exists.
- `evidence_backed`: the story has at least one Citation to an Excerpt.
- `success_measure_linked`: the epic's PRFAQ has a success measure.
- `team_aligned`: the epic's PRFAQ has `state = agreed`.

**PRFAQ agreement (epic)** requires (check keys `readbacks_complete`, `readbacks_match`, `blocking_faq_answered`, `promises_served`):
- a ReadBack from every epic member, all assessed `matches`;
- no blocking internal FAQ without an answer;
- every promise served by at least one story.

Stories that serve no promise are flagged on the epic. They don't block agreement.

Team checks come from the template and can extend either check. The seeded Story template adds:
- Right thing: `within_promise_scope` (no open Product-hat scope note on the story).
- Built right: `arch_questions_answered` (no open Architect-hat challenge), `estimated`, `mock_if_ui_change` (passes when the story has no UI change, or has a `mockUri`).

So a seeded story shows Right thing out of 5 and Built right out of 8.

## Computing checks

`src/domain/checks.ts` exposes pure functions:

```ts
evaluateBuiltRight(story, ctx): CheckResult[]
evaluateRightThing(story, ctx): CheckResult[]
evaluatePrfaqAgreement(epic, ctx): CheckResult[]
// CheckResult = { key, tier, passed, reason, fixTarget: { type, id } }
```

`CheckResult` also carries `label`, `scope` (`right_thing`, `built_right` or `prfaq_agreement`) and `blockers[]` (every offending thing, each with its own `fixTarget`). `fixTarget` is null when the check passes.

`fixTarget` points at the exact thing to fix, so every failing line in the UI can link straight to it.
