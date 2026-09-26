// Everything the workspace screen reads, loaded once per request.
import "server-only";
import { cache } from "react";
import type { DomainSnapshot, FixTarget } from "@/domain/types";
import { currentActorId } from "./actor";
import { prisma } from "./db";
import { loadSnapshot } from "./snapshot";

export const getWorkspace = cache(async () => {
  const ctx = await loadSnapshot(prisma);
  const actorId = await currentActorId(ctx.people);
  const team = await prisma.setting.findUnique({ where: { key: "team" } });
  const teamName = team ? (JSON.parse(team.valueJson) as { name?: string }).name ?? "Team" : "Team";
  return { ctx, actorId, teamName };
});

export async function storyEvents(storyId: string) {
  return prisma.event.findMany({ where: { subjectType: "story", subjectId: storyId }, orderBy: { createdAt: "desc" }, take: 50 });
}

/** The DOM id of the element a fixTarget points at, when it's on the notebook. */
export function anchorFor(target: FixTarget | null, ctx: DomainSnapshot): string | null {
  if (!target) return null;
  if (target.type === "block") return `block-${target.id}`;
  if (target.type === "criterion") return `criterion-${target.id}`;
  if (target.type === "item") {
    const blockId = ctx.items.find((i) => i.id === target.id)?.blockId;
    return blockId ? `block-${blockId}` : null;
  }
  if (target.type === "hatNote") {
    const note = ctx.hatNotes.find((h) => h.id === target.id);
    if (!note) return null;
    if (note.targetType === "block") return `block-${note.targetId}`;
    if (note.targetType === "criterion") return `criterion-${note.targetId}`;
    if (note.targetType === "item") return anchorFor({ type: "item", id: note.targetId }, ctx);
  }
  return null;
}
