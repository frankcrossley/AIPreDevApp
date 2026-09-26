// The right panel's "For this item" tab: what needs someone, beside the notebook.
// Bolt 2 lists items; bolt 3 adds the Scrum Master summary, drafts, hat notes and discovery.

import { isLiveItem, latestStances } from "./checks";
import type { DomainSnapshot, Item, Story } from "./types";

export interface PanelCard {
  itemId: string;
  type: Item["type"];
  text: string;
  detail: string;
  blocking: boolean;
  blockId: string | null;
}

export interface PanelSections {
  decisionsNeeded: PanelCard[];
  talkingPoints: PanelCard[];
  count: number;
}

const TYPE_ORDER = ["decision", "question", "assumption", "risk", "talking_point"];

export function panelSections(story: Story, ctx: DomainSnapshot): PanelSections {
  const name = (id: string | null) => ctx.people.find((p) => p.id === id)?.name ?? id ?? "nobody";
  const items = ctx.items
    .filter((i) => i.parentType === "story" && i.parentId === story.id && isLiveItem(i) && i.status === "open")
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.id.localeCompare(b.id));

  const card = (i: Item, detail: string): PanelCard => ({
    itemId: i.id,
    type: i.type,
    text: i.text,
    detail,
    blocking: i.blocking,
    blockId: i.blockId,
  });

  const decisionsNeeded: PanelCard[] = [];
  const talkingPoints: PanelCard[] = [];
  for (const i of items) {
    if (i.type === "decision") {
      const latest = latestStances(ctx.stances.filter((s) => s.itemId === i.id));
      const given = new Set(ctx.stances.filter((s) => s.itemId === i.id && s.round === i.stanceRound).map((s) => s.personId));
      const missing = i.requiredStanceIds.filter((p) => !given.has(p));
      const objecting = [...latest.values()].filter((s) => s.value === "object").map((s) => s.personId);
      if (objecting.length) decisionsNeeded.push(card(i, `${objecting.map(name).join(", ")} objects`));
      else if (missing.length) decisionsNeeded.push(card(i, `Waiting on ${missing.map(name).join(", ")}`));
    } else if (i.type === "question" && i.blocking) {
      decisionsNeeded.push(card(i, `Blocking · owner ${name(i.ownerId)}`));
    } else {
      talkingPoints.push(card(i, `${i.type.replace("_", " ")} · ${name(i.ownerId)}`));
    }
  }
  return { decisionsNeeded, talkingPoints, count: decisionsNeeded.length + talkingPoints.length };
}
