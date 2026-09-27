// The Scrum Master: deterministic rules, no model calls (ADR-006, docs/ai-teammate.md).

import { evaluateBuiltRight, evaluateRightThing } from "./checks";
import type { Blocker, CheckResult, DomainSnapshot, FixTarget, HatNote, Role, Story } from "./types";

export interface ReadyBlocker {
  checkKey: string;
  ownerId: string;
  reason: string;
  fixTarget: FixTarget;
}

const DONE_STATES = new Set(["ready", "exported"]);

function epicMemberWithRole(story: Story, ctx: DomainSnapshot, role: Role): string | undefined {
  const epic = ctx.epics.find((e) => e.id === story.epicId);
  return epic?.memberIds.find((id) => ctx.people.find((p) => p.id === id)?.role === role);
}

export function hatNoteOwner(note: HatNote, story: Story, ctx: DomainSnapshot): string {
  switch (note.hat) {
    case "arch":
    case "eng":
      return epicMemberWithRole(story, ctx, "tech_lead") ?? story.leadId;
    case "sec":
      return epicMemberWithRole(story, ctx, "security") ?? story.leadId;
    case "pm":
      return ctx.epics.find((e) => e.id === story.epicId)?.ownerId ?? story.leadId;
    default:
      return story.leadId;
  }
}

/** Who owns fixing one blocker. Rules, not judgement. */
function ownerOf(check: CheckResult, blocker: Blocker, story: Story, ctx: DomainSnapshot): string {
  if (blocker.personId) return blocker.personId;
  const t = blocker.fixTarget;
  if (t.type === "hatNote") {
    const note = ctx.hatNotes.find((h) => h.id === t.id);
    if (note) return hatNoteOwner(note, story, ctx);
  }
  if (t.type === "item") {
    const owner = ctx.items.find((i) => i.id === t.id)?.ownerId;
    if (owner) return owner;
  }
  if (t.type === "block") {
    const author = ctx.blocks.find((b) => b.id === t.id)?.authorId;
    if (author) return author;
  }
  if (t.type === "prfaq" || t.type === "epic") {
    return ctx.epics.find((e) => e.id === story.epicId)?.ownerId ?? story.leadId;
  }
  if (check.key === "mock_if_ui_change") return epicMemberWithRole(story, ctx, "design") ?? story.leadId;
  return story.leadId;
}

/** What stands between a story and Ready, and who owns each piece. Empty once Ready. */
export function whatBlocksReady(story: Story, ctx: DomainSnapshot): ReadyBlocker[] {
  if (DONE_STATES.has(story.state)) return [];
  const failing = [...evaluateRightThing(story, ctx), ...evaluateBuiltRight(story, ctx)].filter((r) => !r.passed);
  if (!failing.length) {
    const lead = ctx.people.find((p) => p.id === story.leadId)?.name ?? story.leadId;
    return [
      {
        checkKey: "lead_sign_off",
        ownerId: story.leadId,
        reason: `Waiting on ${lead} to sign off as Ready`,
        fixTarget: { type: "story", id: story.id },
      },
    ];
  }
  return failing.flatMap((check) =>
    check.blockers.map((b) => ({
      checkKey: check.key,
      ownerId: ownerOf(check, b, story, ctx),
      reason: b.reason,
      fixTarget: b.fixTarget,
    })),
  );
}

// ---------- agenda ----------

/**
 * Checks whose fix needs people in a room: stances, open questions, conflicts, hat challenges
 * and alignment. The others (estimates, citations, criteria, mocks) are desk work (ADR-011).
 */
export const ROOM_CHECK_KEYS: ReadonlySet<string> = new Set([
  "stances_complete",
  "no_blocking_questions",
  "no_unresolved_conflicts",
  "arch_questions_answered",
  "within_promise_scope",
  "team_aligned",
]);

export type AgendaKind = "expiring_drafts" | "divergent_readbacks" | "near_ready" | "blocking_questions" | "new_item";

export interface AgendaEntry {
  kind: AgendaKind;
  subjectType: "session" | "epic" | "story";
  subjectId: string;
  title: string;
  reason: string;
  draftIds?: string[];
  personIds?: string[];
  checkKeys?: string[];
  itemIds?: string[];
}

export interface Agenda {
  sessionId: string;
  entries: AgendaEntry[];
  /** Ready and exported items, listed as left off. */
  leftOff: Story[];
}

const MINUTE_MS = 60 * 1000;
const byKey = (a: Story, b: Story) => a.key.localeCompare(b.key, "en", { numeric: true });

/**
 * Agenda order (docs/ai-teammate.md): drafts expiring before or during the session, divergent
 * read-backs, items near Ready whose gaps need the room, blocking questions, new items.
 */
export function buildAgenda(sessionId: string, ctx: DomainSnapshot, now: Date): Agenda {
  const session = ctx.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`No session ${sessionId}`);
  if (session.status === "ended") throw new Error(`Session ${sessionId} has ended`);
  const sessionEnd = session.date.getTime() + session.lengthMinutes * MINUTE_MS;
  const entries: AgendaEntry[] = [];

  const expiring = ctx.drafts
    .filter((d) => d.status === "pending" && d.expiresAt.getTime() > now.getTime() && d.expiresAt.getTime() <= sessionEnd)
    .filter((d) => !ctx.stories.some((s) => s.id === d.targetId && s.archivedAt))
    .sort(
      (a, b) =>
        a.expiresAt.getTime() - b.expiresAt.getTime() ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  if (expiring.length) {
    entries.push({
      kind: "expiring_drafts",
      subjectType: "session",
      subjectId: session.id,
      title: "Triage expiring drafts",
      reason: `${expiring.length} draft${expiring.length === 1 ? "" : "s"} expire before or during the session`,
      draftIds: expiring.map((d) => d.id),
    });
  }

  for (const epic of [...ctx.epics].sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }))) {
    const prfaq = ctx.prfaqs.find((p) => p.epicId === epic.id);
    if (!prfaq || prfaq.state === "agreed") continue;
    const diverging = epic.memberIds.filter((id) =>
      ctx.readBacks.some((r) => r.epicId === epic.id && r.personId === id && r.assessment === "diverges"),
    );
    if (diverging.length) {
      entries.push({
        kind: "divergent_readbacks",
        subjectType: "epic",
        subjectId: epic.id,
        title: `${epic.key} read-backs`,
        reason: `${diverging.map((id) => ctx.people.find((p) => p.id === id)?.name ?? id).join(", ")} read the PRFAQ differently`,
        personIds: diverging,
      });
    }
  }

  const near: AgendaEntry[] = [];
  const blocking: AgendaEntry[] = [];
  const fresh: AgendaEntry[] = [];
  for (const story of ctx.stories.filter((s) => !DONE_STATES.has(s.state) && s.state !== "draft" && !s.archivedAt).sort(byKey)) {
    const failing = [...evaluateRightThing(story, ctx), ...evaluateBuiltRight(story, ctx)].filter((r) => !r.passed);
    const questions = ctx.items.filter(
      (i) => i.parentType === "story" && i.parentId === story.id && i.type === "question" && i.blocking && i.status === "open",
    );
    const base = { subjectType: "story" as const, subjectId: story.id, title: `${story.key} ${story.title}` };

    if (story.state !== "triaged" && failing.length && failing.every((r) => ROOM_CHECK_KEYS.has(r.key))) {
      near.push({
        ...base,
        kind: "near_ready",
        reason: `Needs the room for: ${failing.map((r) => r.label.toLowerCase()).join(", ")}`,
        checkKeys: failing.map((r) => r.key),
      });
    } else if (questions.length) {
      blocking.push({
        ...base,
        kind: "blocking_questions",
        reason: questions.map((q) => q.text).join(" · "),
        itemIds: questions.map((q) => q.id),
      });
    } else if (story.state === "triaged") {
      fresh.push({ ...base, kind: "new_item", reason: "New to refinement" });
    }
  }
  entries.push(...near, ...blocking, ...fresh);

  return {
    sessionId: session.id,
    entries,
    leftOff: ctx.stories.filter((s) => DONE_STATES.has(s.state)).sort(byKey),
  };
}

// ---------- the summary at the top of the right panel ----------

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const count = (n: number, noun: string, lower = false) => {
  const word = n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
  return `${lower ? word.toLowerCase() : word} ${noun}${n === 1 ? "" : "s"}`;
};
const joinParts = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

export const sessionDayLabel = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);

const DECISION_CHECKS = new Set(["stances_complete", "no_blocking_questions", "no_unresolved_conflicts"]);
const ANSWER_CHECKS = new Set(["arch_questions_answered", "within_promise_scope"]);
const EPIC_CHECKS = new Set(["team_aligned", "success_measure_linked"]);

/**
 * What stands between this item and Ready, in one or two plain sentences. Built from the same
 * rules as the checks, so it never says anything the data doesn't (ADR-006).
 */
export function readySummary(story: Story, ctx: DomainSnapshot, now: Date): string {
  const next = ctx.sessions
    .filter((s) => s.status !== "ended" && s.date.getTime() >= now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  const expiring = ctx.drafts.filter(
    (d) =>
      d.targetId === story.id &&
      d.status === "pending" &&
      d.expiresAt.getTime() > now.getTime() &&
      (next ? d.expiresAt.getTime() <= next.date.getTime() : d.expiresAt.getTime() - now.getTime() <= 3 * 86_400_000),
  ).length;
  const draftSentence = expiring
    ? ` ${count(expiring, "draft")} here expire${expiring === 1 ? "s" : ""} ${next ? `before ${sessionDayLabel(next.date)}` : "within three days"}.`
    : "";

  if (DONE_STATES.has(story.state)) return `Ready. Nothing stands between this and Jira.${draftSentence}`;
  const blockers = whatBlocksReady(story, ctx);
  if (blockers.length === 1 && blockers[0].checkKey === "lead_sign_off") {
    const lead = ctx.people.find((p) => p.id === story.leadId)?.name ?? story.leadId;
    return `Every check passes. Waiting on ${lead} to sign off as Ready.${draftSentence}`;
  }
  const unique = (keys: Set<string>) =>
    new Set(blockers.filter((b) => keys.has(b.checkKey)).map((b) => `${b.fixTarget.type}:${b.fixTarget.id}`)).size;
  const decisions = unique(DECISION_CHECKS);
  const answers = unique(ANSWER_CHECKS);
  const other = new Set(
    blockers.filter((b) => !DECISION_CHECKS.has(b.checkKey) && !ANSWER_CHECKS.has(b.checkKey) && !EPIC_CHECKS.has(b.checkKey)).map((b) => b.checkKey),
  ).size;
  const parts = [
    decisions ? count(decisions, "decision") : null,
    answers ? count(answers, "answer") : null,
    other ? count(other, "other check") : null,
  ].filter((p): p is string => p !== null);
  const [first, ...rest] = parts;
  const lead = parts.length
    ? `${joinParts([first, ...rest.map((p) => p.charAt(0).toLowerCase() + p.slice(1))])} ${decisions + answers + other === 1 ? "stands" : "stand"} between this and Ready.`
    : "";
  const epic = blockers.some((b) => EPIC_CHECKS.has(b.checkKey)) ? " The epic's PRFAQ isn't agreed yet." : "";
  return `${lead}${epic}${draftSentence}`.trim();
}
