// The checks view (V6Checks), opened from the meters: both checks, floor and team tags, a short
// subject on every line, a link to the fix, and whether this person can sign off (ADR-007).

import { anchorFor } from "./anchors";
import { CHECK_DEFINITIONS, FLOOR_CHECK_KEYS, evaluateBuiltRight, evaluateRightThing } from "./checks";
import { signOff } from "./lifecycle";
import type { CheckResult, DomainSnapshot, Person, Story, Template } from "./types";

export type CheckLink = { kind: "anchor"; anchor: string } | { kind: "href"; href: string; label: string } | null;

export interface CheckLine {
  key: string;
  label: string;
  /** Short subject after the label, e.g. "downgrade mid-cycle" or "Dan". */
  detail: string;
  tier: "floor" | "team";
  passed: boolean;
  reason: string;
  link: CheckLink;
}

export interface ChecksView {
  rightThing: { passed: number; total: number; lines: CheckLine[] };
  builtRight: { passed: number; total: number; lines: CheckLine[] };
  signOff: { enabled: boolean; reasons: string[]; lead: string };
  /** For a Ready or exported story: checks that fail now, though it was signed off (ADR-015). */
  drift: string[];
}

const LEADING = new Set(["what", "how", "who", "when", "where", "why", "which", "does", "do", "is", "are", "should", "can", "will", "would", "happens", "long", "much", "many"]);
const LINKS = new Set(["on", "of", "about", "for", "with", "if", "to", "in"]);
const ARTICLES = new Set(["a", "an", "the"]);

/** "What happens on a downgrade mid-cycle?" → "downgrade mid-cycle". Plain rules, no model. */
export function shortSubject(text: string, maxWords = 4): string {
  const words = text.replace(/[?.!]+$/, "").trim().split(/\s+/);
  let i = 0;
  const lower = (w: string) => w.toLowerCase().replace(/[^a-z-]/g, "");
  const firstLink = words.findIndex((w, idx) => idx < 5 && LINKS.has(lower(w)));
  if (LEADING.has(lower(words[0] ?? "")) && firstLink > 0) i = firstLink + 1;
  else while (i < words.length - 1 && LEADING.has(lower(words[i]))) i++;
  while (i < words.length - 1 && ARTICLES.has(lower(words[i]))) i++;
  return words.slice(i, i + maxWords).join(" ");
}

function lineFor(r: CheckResult, story: Story, ctx: DomainSnapshot): CheckLine {
  const name = (id: string | undefined) => ctx.people.find((p) => p.id === id)?.name ?? id ?? "";
  const epic = ctx.epics.find((e) => e.id === story.epicId);
  let detail = "";
  if (!r.passed) {
    const first = r.blockers[0];
    switch (r.key) {
      case "no_blocking_questions": {
        const q = ctx.items.find((i) => i.id === first?.fixTarget.id);
        detail = q ? shortSubject(q.text) : "";
        break;
      }
      case "stances_complete":
      case "no_unresolved_conflicts":
        detail = [...new Set(r.blockers.map((b) => (b.personId ? name(b.personId) : "")).filter(Boolean))].join(", ");
        break;
      case "team_aligned": {
        const reads = ctx.readBacks.filter((x) => x.epicId === story.epicId);
        const matching = epic ? epic.memberIds.filter((id) => reads.some((x) => x.personId === id && x.assessment === "matches")).length : 0;
        const diverging = reads.filter((x) => x.assessment === "diverges").map((x) => name(x.personId));
        detail = `read-backs ${matching} of ${epic?.memberIds.length ?? 0}${diverging.length ? `, ${diverging.join(", ")} diverges` : ""}`;
        break;
      }
      default:
        detail = r.blockers.length > 1 ? `${r.blockers.length} to fix` : "";
    }
  }
  const anchor = r.passed ? null : anchorFor(r.fixTarget, ctx);
  const epicTarget = !r.passed && r.fixTarget && ["prfaq", "readBack", "epic", "faq", "promise", "person"].includes(r.fixTarget.type);
  const link: CheckLink = anchor
    ? { kind: "anchor", anchor }
    : epicTarget && epic
      ? { kind: "href", href: `/w/${epic.key}`, label: "Open the PRFAQ and read-backs" }
      : !r.passed
        ? { kind: "anchor", anchor: "story-title" }
        : null;
  return { key: r.key, label: r.label, detail, tier: r.tier, passed: r.passed, reason: r.reason, link };
}

export function readyDrift(story: Story, ctx: DomainSnapshot): string[] {
  if (story.state !== "ready" && story.state !== "exported") return [];
  return [...evaluateRightThing(story, ctx), ...evaluateBuiltRight(story, ctx)].filter((r) => !r.passed).map((r) => r.label);
}

export function checksView(story: Story, ctx: DomainSnapshot, actorId: string, now: Date): ChecksView {
  const right = evaluateRightThing(story, ctx);
  const built = evaluateBuiltRight(story, ctx);
  const column = (results: CheckResult[]) => ({
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    lines: results.map((r) => lineFor(r, story, ctx)),
  });
  const lead = ctx.people.find((p) => p.id === story.leadId)?.name ?? story.leadId;
  const failing = [...right, ...built].filter((r) => !r.passed).length;
  const reasons: string[] = [];
  if (story.state === "ready" || story.state === "exported") reasons.push("Already signed off as Ready");
  else if (story.state === "draft" || story.state === "triaged") reasons.push(`It's ${story.state === "draft" ? "a draft" : "not in refinement yet"}`);
  if (actorId !== story.leadId) reasons.push(`${lead} is the lead`);
  if (failing) reasons.push(`${failing} ${failing === 1 ? "check still fails" : "checks still fail"}`);
  // The same guard the server uses decides; the reasons above only explain it.
  const enabled = signOff(story, actorId, ctx, now).ok;
  return { rightThing: column(right), builtRight: column(built), signOff: { enabled, reasons: enabled ? [] : reasons, lead }, drift: readyDrift(story, ctx) };
}

/** Who may change a template's team checks (ADR-032). */
export function canEditTemplate(person: Person | undefined): boolean {
  return !!person && ["product", "tech_lead", "head_of_product"].includes(person.role);
}

/**
 * Adding a team check makes Ready harder, so product, the tech lead or the head of product can.
 * Removing one makes it easier, so a story's lead can't use it to get their own story through:
 * only the tech lead or the head of product can remove a team check (ADR-032).
 */
export function canChangeTeamChecks(person: Person | undefined, from: string[], to: string[]): { ok: true } | { ok: false; reason: string } {
  if (!canEditTemplate(person)) return { ok: false, reason: "Product, the tech lead or the head of product can change a template's checks" };
  const removes = from.some((k) => !to.includes(k));
  if (removes && !["tech_lead", "head_of_product"].includes(person!.role)) {
    return { ok: false, reason: "Removing a team check needs the tech lead or the head of product" };
  }
  return { ok: true };
}

/** The template editor: floor checks always listed and locked, team checks from the catalogue. */
export function templateEditorView(template: Template, ctx: DomainSnapshot, actorId: string) {
  const floor = [...FLOOR_CHECK_KEYS.right_thing, ...FLOOR_CHECK_KEYS.built_right].map((key) => ({
    key,
    label: CHECK_DEFINITIONS[key].label,
    scope: CHECK_DEFINITIONS[key].scope,
  }));
  const team = Object.values(CHECK_DEFINITIONS)
    .filter((d) => d.tier === "team")
    .map((d) => ({ key: d.key, label: d.label, scope: d.scope, on: template.teamCheckKeys.includes(d.key) }));
  return {
    templateId: template.id,
    name: template.name,
    floor,
    team,
    reason: canEditTemplate(ctx.people.find((p) => p.id === actorId)) ? null : "Product, the tech lead or the head of product can change these",
    /** Adding is open to editors; removing needs the tech lead or the head of product. */
    canRemove: ["tech_lead", "head_of_product"].includes(ctx.people.find((p) => p.id === actorId)?.role ?? ""),
  };
}
