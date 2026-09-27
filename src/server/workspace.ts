// Everything the workspace screen reads, loaded once per request.
import "server-only";
import { cache } from "react";
import { currentActorId } from "./actor";
import { prisma } from "./db";
import { loadSnapshot } from "./snapshot";
import { expireOverdueDrafts } from "./triage";

export const getWorkspace = cache(async () => {
  // The Scrum Master's expiry pass: deterministic, and cheap enough to run on every load.
  await expireOverdueDrafts(prisma);
  const ctx = await loadSnapshot(prisma);
  const actorId = await currentActorId(ctx.people);
  const team = await prisma.setting.findUnique({ where: { key: "team" } });
  const teamName = team ? (JSON.parse(team.valueJson) as { name?: string }).name ?? "Team" : "Team";
  return { ctx, actorId, teamName };
});

export async function storyEvents(storyId: string) {
  return prisma.event.findMany({ where: { subjectType: "story", subjectId: storyId }, orderBy: { createdAt: "desc" }, take: 50 });
}
