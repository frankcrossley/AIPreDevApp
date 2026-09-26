# The AI teammate

One teammate, several hats. Users never manage agents. They see which hat raised a note, and can call one by typing `@qa`, `@architect`, `@engineer`, `@security` or `@product` next to any line.

## The Scrum Master is not an LLM

The Scrum Master is deterministic code in `src/domain/scrum-master.ts` (ADR-006). It:

- builds session agendas;
- expires and archives drafts;
- works out what blocks Ready and who owns it;
- chases missing stances and read-backs;
- runs the timebox in session mode.

It may call the model only to phrase a message, and the facts in that message come from code.

**Agenda order:**
1. Drafts that expire before or during the session.
2. PRFAQ read-backs that diverge.
3. Items one or two checks from Ready, where the missing check needs the room.
4. Blocking questions.
5. New items.

Items already Ready are left off.

## Hats

| Hat | Checks | Speaks up when |
|---|---|---|
| QA | Edge cases, testability, criteria that can't fail | Rules or criteria are written or edited |
| Architect | Cross-service impact, fit with ADRs, NFRs | An item touches more than one service or an ADR |
| Engineer | What the code does today, feasibility | A note contradicts the repo |
| Security | Personal data, residency, policy | Data or a policy is mentioned |
| Product | Fit with the epic's PRFAQ, scope creep | Drafts arrive, or a story serves no promise |

**Hat rules:**
- Output is a question or a cited observation, never an instruction or an answer.
- At most 3 open notes per hat per item, ranked by whether the note would change a check result.
- Volume (`off`, `quiet`, `normal`) is per team. In session mode, hats only surface notes of `kind = conflict`, or notes on content edited during the session.
- Adjustments from team behaviour are recorded as events. Example: a hat note type dismissed 5 times gets quieter. Every adjustment is visible and can be undone.

## AI calls and their contracts

Every call lives in `src/ai/<name>.ts` and has:
- a typed input;
- a JSON schema for the output (request structured output);
- a validator that runs on the server before anything reaches the database.

Validation failures are logged as events, and counted: they're a product metric.

### 1. `shapeStory`: notes into the team's format

**Input:** the story's blocks as `{ id, section, text }`, linked excerpts as `{ id, text }`, and the template format.

**Output:**
```json
{
  "statement": { "text": "...", "refs": ["b12", "e3"] },
  "criteria": [
    { "given": "...", "when": "...", "then": "...", "refs": ["b14"], "origin": "notes" },
    { "given": "...", "when": "...", "then": "...", "refs": [], "origin": "hat", "hat": "qa", "why": "..." }
  ],
  "gaps": [{ "text": "Downgrades are not covered", "refs": ["b16"] }],
  "changes": { "reworded": ["b12"], "merged": [["b10", "b11"]], "dropped": ["b9"] }
}
```

**Validator: the "never adds a fact" check.** Rejects the whole response if any of these fail:
1. Every `ref` exists in the input.
2. Every line with `origin: notes` has at least one ref.
3. Every number, date, amount, percentage and proper noun in a `notes`-origin line appears in the text of at least one cited ref. Use a simple tokeniser; false positives are fine, because they get marked "unconfirmed", not dropped.
4. Lines with `origin: hat` are stored as unconfirmed criteria that need a person.

Anything that fails rule 3 is stored as `origin: hat, hat: "shaper"`: shown dashed and unconfirmed, never silently kept.

### 2. `hatReview`: challenges for an item

**Input:** the item's blocks, items and criteria, plus relevant ADR excerpts and code excerpts from the seed.

**Output:** `HatNote[]` with `{ hat, kind, text, targetId, refs }`.

**Validator:**
- `targetId` exists.
- `refs` exist.
- `text` ends with a question mark, or cites at least one ref.
- The per-hat cap is applied.

### 3. `assessReadBack`: does a read-back match the PRFAQ?

**Input:** the PRFAQ fields and promises, and one read-back.

**Output:** `{ assessment: "matches" | "diverges", note, promiseRefs[] }`.

`too_close` is decided by code, not the model: flag it when normalised text similarity to any PRFAQ sentence is above 0.85. People pasting the headline isn't alignment.

### 4. `extractCandidates`: transcript into drafts

**Input:** a transcript with timestamped lines, and the epic's stories and promises.

**Output:** candidates as `{ quote, locator, suggestedTargetKey, reason }`, plus `skipped: [{ locator, reason }]`.

**Validator:** `quote` must be an exact substring of the transcript line at `locator`. Candidates that fail are dropped and logged.

### 5. `themeSurvey`: survey into counted themes

**Input:** survey rows as `{ rowId, text }`.

**Output:** `themes[]` as `{ label }`, plus `assignments[]` as `{ rowId, themeLabels[] }`.

**Code, not the model, counts the rows per theme.** Themes that contradict the epic's direction are kept and shown; don't filter for agreement.

## Prompting guidance

- Give the model IDs and ask it to cite them. Never ask it to "summarise".
- System prompts state the hat's job and the non-negotiables verbatim from CLAUDE.md.
- Keep prompts in `src/ai/prompts/` as versioned text files, so changes are reviewable.
