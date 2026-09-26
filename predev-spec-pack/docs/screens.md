# Screens: the single workspace

Wireframe sources are in `docs/wireframes/` (open them as reference; they use the design canvas's markup and won't render on their own). The live canvas, with the full design history across v1 to v6, is at https://claude.ai/artifact/GJwMAiLJF1WNrqsd6QT6ae.

## Layout

| Column | Width | Contents |
|---|---|---|
| Header | 52px, full width | Team name, search, next session, "viewing as" person switcher (ADR-003), sync status |
| Left | 270px | Backlog tree (epic, then stories) with state and meters on each row. In session mode it becomes the agenda. |
| Centre | flexible | The notebook for the selected epic or story |
| Right | 420px | The context panel, with tabs that change by view |

Minimum supported width: 1280px. Mobile is out of scope.

## Views of the same screen

### Story view (`V6Story.dc.html`)
**Centre:**
- key, state pill and lead;
- title;
- "Serves the PRFAQ promise …" link;
- the two meters (Right thing, Built right), which open the checks;
- a Notes / Shaped toggle;
- sections from the template, with chips inline and hat notes under the line they're about;
- a hint line: `?`, `decision:`, `@qa`.

**Right tabs:** For this item (count) · Details · Activity.

"For this item" sections, in this order:
1. Scrum Master summary (black box): what stands between this item and Ready.
2. Decisions needed.
3. Talking points: hat challenges, plus drafts with their expiry.
4. From discovery: themes with counts, and quotes with locators.

Each card has one-click actions: decide, put to the session, accept, merge, reject, move.

### Epic view (`V6Epic.dc.html`)
**Centre:** the PRFAQ.
- headline and subhead;
- the problem;
- what changes;
- a real customer quote with its locator;
- how we'll know it worked;
- the customer FAQ, each answer linked to a story;
- the internal FAQ, blocking entries highlighted.

**Right tabs:** Alignment · For this epic · Details.

Alignment shows:
- read-backs per member with their assessment;
- promises and stories, including stories that serve no promise;
- evidence against;
- the "Agree the PRFAQ" button, disabled with a reason until it can pass.

### Session mode (`V6Session.dc.html`)
- The header turns dark and shows live status, attendees and the timer.
- Left: the agenda in session order, and what was left off.
- Centre: the current item, the decision being written, and the stance round.
- Right: talking points in agenda order, and a Parked tab.

Anything not reached becomes an async talking point with an owner and a due date.

### Checks (`V6Checks.dc.html`)
Opened from the meters. Two columns, Right thing and Built right, with floor and team tags. Every failing line links to its `fixTarget`. The flow strip reads: Right thing + Built right → lead signs off → Ready in Jira.

### Supporting screens from v5
These are panels and flows inside the same workspace, not separate pages:
- `V5Ingest.dc.html`: adding a source, candidates from a transcript, survey themes. Opens as a modal from "+ Add source".
- `V5Shape.dc.html`: the Shaped view, notes and output side by side, with the unconfirmed hat line dashed.
- `V5Lenses.dc.html`: team settings for the hats, their volume, and what they've adjusted.
- `V5Ready.dc.html`: the Jira side, covering the sync, the sprint rule and drift.

## Design tokens

| Token | Value | Use |
|---|---|---|
| `paper` | `#fdfcf9` | Page background |
| `panel` | `#ffffff` | Cards, right panel |
| `sunk` | `#f3f1ec` | Left column, callouts |
| `ink` | `#1f1f1d` | Text, primary buttons, Scrum Master box |
| `line` | `#2b2a27` | Borders |
| `muted` | `#57544e` | Secondary text |
| `hairline` | `#e2dfd8` | Dividers |
| `agreed` / `agreed-bg` | `#1f4f8a` / `#e3ecf7` | Agreed, sourced, passing, Ready |
| `alert` / `alert-bg` | `#b4460c` / `#fbe9dc` | Blocking, conflict, expiring |

- **Fonts:** IBM Plex Serif for titles, IBM Plex Sans for body text, IBM Plex Mono for keys, labels and chips.
- **Borders:** solid means sourced or agreed; dashed means assumed, draft or unconfirmed.
- **Accessibility:** keep text contrast at 4.5:1 or above, and use real buttons and labels.

The wireframes are deliberately lo-fi. The prototype can be more polished, but it must keep these meanings.
