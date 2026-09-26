// Keys for new stories: the epic's prefix, one past the highest number in use.
import type { DomainSnapshot, Epic } from "./types";

export function nextStoryKey(epic: Epic, ctx: Pick<DomainSnapshot, "stories" | "epics">): string {
  const prefix = epic.key.split("-")[0];
  const numbers = [...ctx.stories, ...ctx.epics]
    .map((x) => x.key.match(new RegExp(`^${prefix}-(\\d+)$`)))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => Number(m[1]));
  return `${prefix}-${Math.max(0, ...numbers) + 1}`;
}
