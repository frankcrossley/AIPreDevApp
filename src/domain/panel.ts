// The right panel's "For this item" tab (03-right-panel): everything that needs someone, ranked.
// Order: the Scrum Master summary, Decisions needed, Talking points, From discovery. Empty
// sections are left out. Cards carry their actions, with a reason when an action isn't allowed.

import { isLiveItem, latestStances } from "./checks";
import { anchorFor } from "./anchors";
import { expiryLabel } from "./drafts";
import { sourceLabel } from "./notebook-view";
import { hatNoteOwner, readySummary, sessionDayLabel } from "./scrum-master";
import { describeSuggestion, editsDirectly } from "./suggestions";
import { canTriage, mergeTargets } from "./triage";
import type { DomainSnapshot, Draft, Epic, HatNote, Item, Story } from "./types";

export type ActionKind =
  | "decide"
  | "put_to_session"
  | "answer"
  | "add_to_page"
  | "dismiss"
  | "accept"
  | "merge"
  | "reject"
  | "move"
  | "withdraw";

export interface CardAction {
  kind: ActionKind;
  label: string;
  /** Why the action isn't available to the person viewing, or null when it is. */
  disabledReason: string | null;
  /** For move: where to. For put_to_session: which session. */
  targetId?: string;
}

export interface PanelCard {
  id: string;
  kind: "item" | "hatNote" | "draft" | "theme";
  /** Short label: Decision, Blocking, Arch, QA, Draft, Suggestion, Theme. */
  tag: string;
  title: string;
  detail: string;
  /** alert: blocking or conflict (orange). dashed: draft, assumed or unconfirmed. solid: sourced. */
  tone: "alert" | "dashed" | "solid";
  anchor: string | null;
  actions: CardAction[];
  /** A hat's hint on this card, e.g. "PM · Fits BILL-160 better", with its own action. */
  hint: { tag: string; text: string; action: CardAction | null } | null;
  mergeTargets?: { blockId: string; text: string; disabledReason: string | null }[];
}

export interface PanelSection {
  key: "decisions" | "talking" | "discovery";
  title: string;
  cards: PanelCard[];
}

export interface ForThisItem {
  summary: string;
  sections: PanelSection[];
  count: number;
}

const HAT_TAG: Record<string, string> = { qa: "QA", arch: "Arch", eng: "Eng", sec: "Security", pm: "PM" };
const CHIP_TAG: Record<string, string> = { decision: "Decision", question: "Question", assumption: "Assumption", risk: "Risk", talking_point: "Talking point" };

function nextSession(ctx: DomainSnapshot, now: Date) {
  return ctx.sessions
    .filter((s) => s.status !== "ended" && s.date.getTime() >= now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
}

export function forThisItem(story: Story, ctx: DomainSnapshot, now: Date, actorId: string): ForThisItem {
  const name = (id: string | null) => ctx.people.find((p) => p.id === id)?.name ?? id ?? "nobody";
  const lead = name(story.leadId);
  const isLead = editsDirectly(actorId, story);
  const session = nextSession(ctx, now);
  const putToSession = (subjectId: string): CardAction[] =>
    session
      ? [
          {
            kind: "put_to_session",
            label: `Put to ${sessionDayLabel(session.date)}`,
            disabledReason: session.agenda.includes(subjectId) ? `On the ${sessionDayLabel(session.date)} agenda` : null,
            targetId: session.id,
          },
        ]
      : [];
  const leadOnly = (kind: ActionKind, label: string): CardAction => ({ kind, label, disabledReason: isLead ? null : `${lead} is the lead` });

  const contentIds = new Set<string>([story.id]);
  const items = ctx.items.filter((i) => i.parentType === "story" && i.parentId === story.id && isLiveItem(i));
  for (const b of ctx.blocks) if (b.parentType === "story" && b.parentId === story.id) contentIds.add(b.id);
  for (const i of items) contentIds.add(i.id);
  for (const c of ctx.criteria) if (c.storyId === story.id) contentIds.add(c.id);

  const itemCard = (i: Item, detail: string, tone: PanelCard["tone"]): PanelCard => {
    const cited = ctx.citations.find((c) => c.fromType === "item" && c.fromId === i.id && c.toType === "block");
    return {
      id: i.id,
      kind: "item",
      tag: i.type === "question" && i.blocking ? "Blocking" : (CHIP_TAG[i.type] ?? i.type),
      title: i.text,
      detail,
      tone,
      anchor: anchorFor({ type: "item", id: i.id }, ctx) ?? (cited ? `block-${cited.toId}` : null),
      actions: [],
      hint: null,
    };
  };

  const decisions: PanelCard[] = [];
  const talking: PanelCard[] = [];
  const discovery: PanelCard[] = [];

  // Items: decisions waiting on stances or objections, blocking questions, then the rest.
  for (const i of items.filter((x) => x.status === "open")) {
    if (i.type === "decision") {
      const latest = latestStances(ctx.stances.filter((s) => s.itemId === i.id));
      const given = new Set(ctx.stances.filter((s) => s.itemId === i.id && s.round === i.stanceRound).map((s) => s.personId));
      const missing = i.requiredStanceIds.filter((p) => !given.has(p));
      const objecting = [...latest.values()].filter((s) => s.value === "object").map((s) => s.personId);
      const detail = objecting.length ? `${objecting.map(name).join(", ")} objects` : missing.length ? `Waiting on ${missing.map(name).join(", ")}` : null;
      if (!detail) continue;
      decisions.push({ ...itemCard(i, detail, objecting.length ? "alert" : "dashed"), actions: [{ kind: "decide", label: "Decide now", disabledReason: null }, ...putToSession(i.id)] });
    } else if (i.type === "question" && i.blocking) {
      decisions.push({
        ...itemCard(i, `Needs a decision · owner ${name(i.ownerId)}`, "alert"),
        actions: [{ kind: "decide", label: "Decide now", disabledReason: null }, ...putToSession(i.id)],
      });
    } else {
      talking.push({ ...itemCard(i, `${CHIP_TAG[i.type] ?? i.type} · ${name(i.ownerId)}`, i.type === "assumption" ? "dashed" : "solid"), actions: putToSession(i.id) });
    }
  }

  // Hat notes on this story's content. Ones that hold up a check need a decision; the rest are talking points.
  const notes = ctx.hatNotes.filter((h) => h.status === "open" && contentIds.has(h.targetId));
  const hatCard = (h: HatNote): PanelCard => ({
    id: h.id,
    kind: "hatNote",
    tag: HAT_TAG[h.hat] ?? h.hat,
    title: h.text,
    detail: `${h.kind === "conflict" ? "Conflict" : "Challenge"} · owner ${name(hatNoteOwner(h, story, ctx))}`,
    tone: h.kind === "conflict" ? "alert" : "dashed",
    anchor: anchorFor({ type: "hatNote", id: h.id }, ctx),
    actions: [],
    hint: null,
  });
  for (const h of notes) {
    const holdsUpCheck = h.kind === "conflict" || ((h.hat === "arch" || h.hat === "eng" || h.hat === "sec") && h.kind === "challenge");
    if (holdsUpCheck) {
      decisions.push({ ...hatCard(h), actions: [{ kind: "answer", label: "Answer", disabledReason: null }, ...putToSession(h.id)] });
    } else {
      talking.push({
        ...hatCard(h),
        actions: [{ kind: "add_to_page", label: "Add to page", disabledReason: null }, leadOnly("dismiss", "Dismiss")],
      });
    }
  }

  // Drafts: people's notes and suggestions are talking points; quotes from sources are discovery.
  const drafts = ctx.drafts
    .filter((d) => d.targetType === "story" && d.targetId === story.id && d.status === "pending" && d.expiresAt.getTime() > now.getTime())
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime() || a.id.localeCompare(b.id));
  for (const d of drafts) {
    const card = draftCard(d, ctx, now, actorId);
    if (d.excerptId || d.sourceId) discovery.push(card);
    else talking.push(card);
  }

  // Themes from discovery that this story already cites.
  const citedExcerpts = new Set(ctx.citations.filter((c) => c.toType === "excerpt" && contentIds.has(c.fromId)).map((c) => c.toId));
  for (const e of ctx.excerpts.filter((x) => x.kind === "theme" && citedExcerpts.has(x.id))) {
    discovery.unshift({
      id: e.id,
      kind: "theme",
      tag: "Theme",
      title: e.text,
      detail: `${sourceLabel(e.id, ctx)} · already cited on this page`,
      tone: "solid",
      anchor: null,
      actions: [],
      hint: null,
    });
  }

  const sections: PanelSection[] = (
    [
      { key: "decisions", title: "Decisions needed", cards: decisions },
      { key: "talking", title: "Talking points", cards: talking },
      { key: "discovery", title: "From discovery", cards: discovery },
    ] as PanelSection[]
  ).filter((s) => s.cards.length > 0);
  return { summary: readySummary(story, ctx, now), sections, count: sections.reduce((n, s) => n + s.cards.length, 0) };
}

export function draftCard(d: Draft, ctx: DomainSnapshot, now: Date, actorId: string): PanelCard {
  const name = (id: string | null) => ctx.people.find((p) => p.id === id)?.name ?? id ?? "nobody";
  const triage = canTriage(actorId, d, ctx);
  const reason = triage.ok ? null : triage.reason;
  const expiry = expiryLabel(d, now);
  if (d.kind === "suggestion") {
    const actions: CardAction[] = [
      { kind: "accept", label: "Accept", disabledReason: reason },
      { kind: "reject", label: "Reject", disabledReason: reason },
    ];
    if (d.authorId === actorId) actions.push({ kind: "withdraw", label: "Withdraw", disabledReason: null });
    return {
      id: d.id,
      kind: "draft",
      tag: "Suggestion",
      title: describeSuggestion(d),
      detail: `${name(d.authorId)} · ${d.section} · ${expiry}`,
      tone: "dashed",
      anchor: d.op === "add" ? (d.afterBlockId ? `block-${d.afterBlockId}` : null) : d.blockId ? `block-${d.blockId}` : null,
      actions,
      hint: null,
    };
  }
  const excerpt = ctx.excerpts.find((e) => e.id === d.excerptId);
  const source = ctx.sources.find((s) => s.id === (excerpt?.sourceId ?? d.sourceId));
  const origin = excerpt ? `${source?.title ?? "Source"}, ${excerpt.locator}` : source ? source.title : name(d.authorId);
  const pm = ctx.hatNotes.find((h) => h.status === "open" && h.targetType === "draft" && h.targetId === d.id);
  const moveTo = pm?.moveToId ? (ctx.stories.find((s) => s.id === pm.moveToId) ?? null) : null;
  return {
    id: d.id,
    kind: "draft",
    tag: "Draft",
    title: excerpt || d.sourceId ? `"${d.text}"` : d.text,
    detail: `${origin} · draft · ${expiry}`,
    tone: "dashed",
    anchor: null,
    actions: [
      { kind: "accept", label: "Accept", disabledReason: reason },
      { kind: "merge", label: "Merge", disabledReason: reason },
      { kind: "reject", label: "Reject", disabledReason: reason },
    ],
    hint: pm
      ? {
          tag: HAT_TAG[pm.hat] ?? pm.hat,
          text: pm.text,
          action: moveTo ? { kind: "move", label: "Move it there", disabledReason: reason, targetId: moveTo.id } : null,
        }
      : null,
    mergeTargets: mergeTargets(d, ctx),
  };
}

/** The epic's "For this epic" tab: drafts aimed at the epic. Accepting waits for the PRFAQ editor (bolt 5). */
export function forThisEpic(epic: Epic, ctx: DomainSnapshot, now: Date, actorId: string): PanelCard[] {
  return ctx.drafts
    .filter((d) => d.targetType === "epic" && d.targetId === epic.id && d.status === "pending" && d.expiresAt.getTime() > now.getTime())
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
    .map((d) => {
      const card = draftCard(d, ctx, now, actorId);
      return {
        ...card,
        actions: card.actions
          .filter((a) => a.kind !== "merge")
          .map((a) => (a.kind === "accept" ? { ...a, disabledReason: a.disabledReason ?? "Epic notes are accepted into the PRFAQ, which arrives in a later build" } : a)),
        mergeTargets: undefined,
      };
    });
}
