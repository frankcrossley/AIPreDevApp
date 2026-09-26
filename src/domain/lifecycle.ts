// The story state machine. docs/domain.md "Story lifecycle", ADR-007.
// The only way to reach `ready` is signOff(): all checks passing plus the lead's sign-off.

import { allChecksPass, evaluateBuiltRight, evaluateRightThing, isLiveItem, latestStances } from "./checks";
import type { DomainSnapshot, Item, Story, StoryState } from "./types";

export type TransitionResult = { ok: true; story: Story } | { ok: false; reasons: string[] };

export interface TransitionOptions {
  actorId: string;
  now: Date;
  /** For triaged → in_refinement: put on a session agenda, or opened for async work. */
  via?: { kind: "async" } | { kind: "session"; sessionId: string };
  /** For ready → exported. */
  exportSucceeded?: boolean;
}

const fail = (...reasons: string[]): TransitionResult => ({ ok: false, reasons });

/** Guard for in_refinement → agreed. */
function agreementBlockers(story: Story, ctx: DomainSnapshot): string[] {
  // Every decision has its stances, no open blocking question, and no unresolved `object` stance.
  // Hat conflicts are left to the Built right check; they don't stop people agreeing.
  const reasons: string[] = [];
  for (const r of evaluateBuiltRight(story, ctx)) {
    if (r.key === "stances_complete" || r.key === "no_blocking_questions") {
      if (!r.passed) reasons.push(`${r.key}: ${r.reason}`);
    } else if (r.key === "no_unresolved_conflicts") {
      for (const b of r.blockers.filter((x) => x.personId)) reasons.push(`${r.key}: ${b.reason}`);
    }
  }
  return reasons;
}

export function canTransition(
  story: Story,
  to: StoryState,
  ctx: DomainSnapshot,
  opts: TransitionOptions,
): { ok: true } | { ok: false; reasons: string[] } {
  return checkGuard(story, story.state, to, ctx, opts);
}

function checkGuard(
  story: Story,
  from: StoryState,
  to: StoryState,
  ctx: DomainSnapshot,
  opts: TransitionOptions,
): { ok: true } | { ok: false; reasons: string[] } {
  if (to === "ready") {
    return { ok: false, reasons: ["A story becomes ready only through the lead's sign-off, once every check passes"] };
  }
  if (from === "draft" && to === "triaged") {
    return opts.actorId === story.leadId
      ? { ok: true }
      : { ok: false, reasons: ["Only the story's lead can triage it"] };
  }
  if (from === "triaged" && to === "in_refinement") {
    const reasons: string[] = [];
    if (!ctx.templates.some((t) => t.id === story.templateId)) reasons.push("The story has no template");
    if (!opts.via) {
      reasons.push("Add it to a session agenda or open it for async work first");
    } else if (opts.via.kind === "session") {
      const sessionId = opts.via.sessionId;
      const session = ctx.sessions.find((s) => s.id === sessionId);
      if (!session || session.status === "ended") reasons.push("That session isn't planned or live");
      else if (!session.agenda.includes(story.id)) reasons.push("The story isn't on that session's agenda");
    }
    return reasons.length ? { ok: false, reasons } : { ok: true };
  }
  if (from === "in_refinement" && to === "agreed") {
    const reasons = agreementBlockers(story, ctx);
    return reasons.length ? { ok: false, reasons } : { ok: true };
  }
  if (from === "ready" && to === "exported") {
    return opts.exportSucceeded ? { ok: true } : { ok: false, reasons: ["The export hasn't succeeded"] };
  }
  if (to === "in_refinement" && (from === "agreed" || from === "ready" || from === "exported")) {
    return { ok: false, reasons: ["Stories go back to refinement through an edit to agreed content (reopenOnEdit)"] };
  }
  return { ok: false, reasons: [`There is no transition from ${from} to ${to}`] };
}

/** Moves a story along the lifecycle. Never returns a `ready` story: use signOff for that. */
export function transition(story: Story, to: StoryState, ctx: DomainSnapshot, opts: TransitionOptions): TransitionResult {
  const guard = checkGuard(story, story.state, to, ctx, opts);
  if (!guard.ok) return guard;
  return { ok: true, story: { ...story, state: to } };
}

/**
 * The lead signs off a story as Ready. Refused unless the actor is the lead, every Right thing
 * and Built right check passes, and the story is in refinement or agreed.
 */
export function signOff(story: Story, actorId: string, ctx: DomainSnapshot, now: Date): TransitionResult {
  const reasons: string[] = [];
  if (story.state === "in_refinement") {
    // Signing off from refinement passes through agreed, so its guard must hold too.
    reasons.push(...agreementBlockers(story, ctx));
  } else if (story.state !== "agreed") {
    reasons.push(`A story that is ${story.state} can't be signed off`);
  }
  if (actorId !== story.leadId) reasons.push("Only the story's lead can sign off");
  if (!allChecksPass(story, ctx)) {
    for (const r of [...evaluateRightThing(story, ctx), ...evaluateBuiltRight(story, ctx)]) {
      if (!r.passed) reasons.push(`${r.key}: ${r.reason}`);
    }
  }
  if (reasons.length) return fail(...new Set(reasons));
  return { ok: true, story: { ...story, state: "ready", signedOffBy: actorId, signedOffAt: now } };
}

export interface ReopenResult {
  story: Story;
  /** Decisions whose stance round was bumped. */
  items: Item[];
  /** Everyone who had agreed to the edited content and must give a stance again. */
  askStanceFrom: string[];
}

/**
 * An edit to agreed content, or a Jira-side change, reopens the story: back to in_refinement,
 * sign-off cleared, and a new stance round for the decisions touched. Once a story is agreed,
 * ready or exported, all of its content counts as agreed, so any edit reopens it (ADR-015).
 * `editedId` is the block, item, criterion or story that changed.
 */
export function reopenOnEdit(story: Story, editedId: string, ctx: DomainSnapshot): ReopenResult {
  const decisions = ctx.items.filter(
    (i) => i.parentType === "story" && i.parentId === story.id && i.type === "decision" && isLiveItem(i),
  );
  // An edit to the story itself or to a criterion (e.g. Jira drift) touches everything agreed on it.
  const storyWide = editedId === story.id || ctx.criteria.some((c) => c.id === editedId && c.storyId === story.id);
  const touched =
    storyWide
      ? decisions
      : decisions.filter((i) => i.id === editedId || (i.blockId !== null && i.blockId === editedId));

  const items: Item[] = [];
  const askStanceFrom: string[] = [];
  for (const item of touched) {
    const agreed = [...latestStances(ctx.stances.filter((s) => s.itemId === item.id && s.round === item.stanceRound)).values()]
      .filter((s) => s.value === "agree")
      .map((s) => s.personId);
    if (!agreed.length) continue;
    items.push({ ...item, stanceRound: item.stanceRound + 1 });
    const order = [...item.requiredStanceIds, ...agreed];
    for (const p of order) if (agreed.includes(p) && !askStanceFrom.includes(p)) askStanceFrom.push(p);
  }

  const wasAgreed = story.state === "agreed" || story.state === "ready" || story.state === "exported";
  return {
    story: wasAgreed || story.signedOffBy
      ? { ...story, state: wasAgreed ? "in_refinement" : story.state, signedOffBy: null, signedOffAt: null }
      : story,
    items,
    askStanceFrom,
  };
}
