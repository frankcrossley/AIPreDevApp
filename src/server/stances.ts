// Stances, who's asked, answers to questions, and template checks. Rules are in src/domain.
import { randomUUID } from "node:crypto";
import { updateTeamChecks } from "@/domain/checks";
import { canEditTemplate } from "@/domain/checks-view";
import { answerQuestion, planChange } from "@/domain/notebook";
import { recordStance, setRequiredStances } from "@/domain/stances";
import type { StanceValue } from "@/domain/types";
import type { Db } from "./prisma";
import { changeWrites, citationWrites, eventWrite } from "./notebook";
import { loadSnapshot } from "./snapshot";
import type { ActionResult } from "./triage";

/** Records the person's own stance on a decision (CLAUDE.md rule 2: only people take stances). */
export async function recordStanceAction(
  db: Db,
  input: { itemId: string; actorId: string; value: StanceValue; reason: string | null; now?: Date },
): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const ctx = await loadSnapshot(db);
  const item = ctx.items.find((i) => i.id === input.itemId);
  const story = ctx.stories.find((s) => s.id === item?.parentId);
  if (!item || !story) return { status: "refused", reason: "Stances are for decisions on a story" };
  let stance;
  try {
    stance = recordStance({ ctx, itemId: input.itemId, personId: input.actorId, value: input.value, reason: input.reason, now, id: randomUUID() });
  } catch (e) {
    return { status: "refused", reason: e instanceof Error ? e.message : "Couldn't record the stance" };
  }
  await db.$transaction([
    db.stance.create({ data: stance }),
    eventWrite(db, "stance.recorded", input.actorId, story.id, { itemId: item.id, value: stance.value, round: stance.round }, now),
  ]);
  return { status: "done" };
}

export async function setRequiredStancesAction(db: Db, input: { itemId: string; personIds: string[]; actorId: string; now?: Date }): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const ctx = await loadSnapshot(db);
  const item = ctx.items.find((i) => i.id === input.itemId);
  const story = ctx.stories.find((s) => s.id === item?.parentId);
  if (!item || !story) return { status: "refused", reason: "No such decision" };
  let updated;
  try {
    updated = setRequiredStances(item, input.personIds, input.actorId, story, ctx);
  } catch (e) {
    return { status: "refused", reason: e instanceof Error ? e.message : "Couldn't change who's asked" };
  }
  await db.$transaction([
    db.item.update({ where: { id: item.id }, data: { requiredStanceIdsJson: JSON.stringify(updated.requiredStanceIds) } }),
    eventWrite(db, "stances.asked", input.actorId, story.id, { itemId: item.id, personIds: updated.requiredStanceIds }, now),
  ]);
  return { status: "done" };
}

/** The lead answers an open question: a new line under it, and the question resolved. */
export async function answerQuestionAction(
  db: Db,
  input: { itemId: string; actorId: string; text: string; asDecision: boolean; confirmReopen?: boolean; now?: Date },
): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const ctx = await loadSnapshot(db);
  let r;
  try {
    r = answerQuestion({ ctx, itemId: input.itemId, text: input.text, asDecision: input.asDecision, actorId: input.actorId, now, newId: () => `x-${randomUUID().slice(0, 8)}` });
  } catch (e) {
    return { status: "refused", reason: e instanceof Error ? e.message : "Couldn't answer it" };
  }
  const plan = planChange(r.ops, r.story, ctx);
  if (plan.needsConfirmation && !input.confirmReopen) return { status: "needs_confirmation", warning: plan.warning };
  await db.$transaction([
    ...changeWrites(db, plan, r.story, ctx, input.actorId, now),
    ...citationWrites(db, r.citations),
    eventWrite(db, "question.answered", input.actorId, r.story.id, { itemId: input.itemId }, now),
  ]);
  return { status: "done" };
}

/** Changes a template's team checks. Floor checks can't be listed, so they can't be removed. */
export async function saveTemplateChecksAction(
  db: Db,
  input: { templateId: string; teamCheckKeys: string[]; actorId: string; now?: Date },
): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const ctx = await loadSnapshot(db);
  const template = ctx.templates.find((t) => t.id === input.templateId);
  if (!template) return { status: "refused", reason: "No such template" };
  if (!canEditTemplate(ctx.people.find((p) => p.id === input.actorId))) {
    return { status: "refused", reason: "Product, the tech lead or the head of product can change a template's checks" };
  }
  let updated;
  try {
    updated = updateTeamChecks(template, input.teamCheckKeys);
  } catch (e) {
    return { status: "refused", reason: e instanceof Error ? e.message : "Couldn't change the checks" };
  }
  await db.$transaction([
    db.template.update({ where: { id: template.id }, data: { teamCheckKeysJson: JSON.stringify(updated.teamCheckKeys) } }),
    db.event.create({
      data: {
        id: randomUUID(),
        type: "template.checks_changed",
        actorId: input.actorId,
        subjectType: "template",
        subjectId: template.id,
        payloadJson: JSON.stringify({ from: template.teamCheckKeys, to: updated.teamCheckKeys }),
        createdAt: now,
      },
    }),
  ]);
  return { status: "done" };
}
