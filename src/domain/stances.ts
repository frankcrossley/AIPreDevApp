// Stances: only people take them (CLAUDE.md rule 2). Agree, concern or object, recorded by the
// person themselves, in the decision's current round (ADR-012, ADR-031).

import { isLiveItem, latestStances } from "./checks";
import type { DomainSnapshot, Item, Stance, StanceValue, Story } from "./types";

export type Permission = { ok: true } | { ok: false; reason: string };

const liveDecision = (itemId: string, ctx: DomainSnapshot): Item | undefined =>
  ctx.items.find((i) => i.id === itemId && i.type === "decision" && isLiveItem(i));

const LOCKED_STATES = new Set(["ready", "exported"]);

const storyOf = (item: Item, ctx: DomainSnapshot) => (item.parentType === "story" ? ctx.stories.find((s) => s.id === item.parentId) : undefined);

export function canRecordStance(personId: string, itemId: string, ctx: DomainSnapshot): Permission {
  const item = liveDecision(itemId, ctx);
  if (!item) return { ok: false, reason: "Stances are for decisions" };
  const story = storyOf(item, ctx);
  if (story && LOCKED_STATES.has(story.state)) return { ok: false, reason: `${story.key} is Ready. Edit it to reopen it before changing stances.` };
  if (!item.requiredStanceIds.includes(personId)) return { ok: false, reason: "You weren't asked for a stance on this" };
  if (!ctx.people.some((p) => p.id === personId)) return { ok: false, reason: "Unknown person" };
  return { ok: true };
}

/** A person's stance, in the decision's current round. An objection needs a reason. */
export function recordStance(input: {
  ctx: DomainSnapshot;
  itemId: string;
  personId: string;
  value: StanceValue;
  reason: string | null;
  now: Date;
  id: string;
}): Stance {
  const permission = canRecordStance(input.personId, input.itemId, input.ctx);
  if (!permission.ok) throw new Error(permission.reason);
  if (!["agree", "concern", "object"].includes(input.value)) throw new Error("A stance is agree, concern or object");
  const reason = input.reason?.trim() || null;
  if (input.value === "object" && (!reason || reason.length < 5)) throw new Error("Say why you object, in a few words");
  const item = liveDecision(input.itemId, input.ctx)!;
  return { id: input.id, itemId: item.id, personId: input.personId, value: input.value, reason, round: item.stanceRound, createdAt: input.now };
}

export interface StanceRow {
  personId: string;
  name: string;
  value: StanceValue | null;
  reason: string | null;
}

/** Everyone asked on a decision and where they stand in the current round. */
export function stanceSummary(item: Item, ctx: DomainSnapshot): StanceRow[] {
  const latest = latestStances(ctx.stances.filter((s) => s.itemId === item.id && s.round === item.stanceRound));
  return item.requiredStanceIds.map((personId) => {
    const s = latest.get(personId);
    return { personId, name: ctx.people.find((p) => p.id === personId)?.name ?? personId, value: s?.value ?? null, reason: s?.reason ?? null };
  });
}

/** People who can be asked for a stance on a story's decision: the epic's members. */
export function askablePeople(story: Story, ctx: DomainSnapshot): string[] {
  return ctx.epics.find((e) => e.id === story.epicId)?.memberIds ?? [];
}

/**
 * The lead chooses who's asked, from the epic's members. Nobody with an unresolved objection can
 * be dropped (they must be able to resolve it, ADR-012), and the list is fixed once the story is
 * Ready: edit it to reopen it first (ADR-031).
 */
export function setRequiredStances(item: Item, personIds: string[], actorId: string, story: Story, ctx: DomainSnapshot): Item {
  if (actorId !== story.leadId) throw new Error(`${ctx.people.find((p) => p.id === story.leadId)?.name ?? story.leadId} is the lead`);
  if (item.type !== "decision") throw new Error("Only decisions ask for stances");
  if (LOCKED_STATES.has(story.state)) throw new Error(`${story.key} is Ready. Edit it to reopen it before changing who's asked.`);
  const ids = [...new Set(personIds)];
  if (!ids.length) throw new Error("Ask at least one person");
  const askable = new Set(askablePeople(story, ctx));
  for (const id of ids) if (!askable.has(id)) throw new Error(`${ctx.people.find((p) => p.id === id)?.name ?? id} isn't on the epic`);
  const latest = latestStances(ctx.stances.filter((s) => s.itemId === item.id));
  for (const [personId, stance] of latest) {
    if (stance.value === "object" && !ids.includes(personId)) {
      throw new Error(`${ctx.people.find((p) => p.id === personId)?.name ?? personId} objects. They stay asked until they resolve it.`);
    }
  }
  // Dropping someone who was asked changes what agreement means, so everyone restates: a new
  // round. Otherwise a lead could pass "Stances complete" by removing whoever hasn't answered.
  const dropped = item.requiredStanceIds.filter((id) => !ids.includes(id));
  const anyStance = ctx.stances.some((s) => s.itemId === item.id && s.round === item.stanceRound);
  return { ...item, requiredStanceIds: ids, stanceRound: dropped.length && anyStance ? item.stanceRound + 1 : item.stanceRound };
}
