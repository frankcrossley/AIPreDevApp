// What the notebook shows for a story: its lines per section, each chip's status, and where
// each line is sourced from. Computed here so the UI only displays it.

import { isLiveItem, latestStances } from "./checks";
import type { DomainSnapshot, ItemType, Story } from "./types";

export interface EditorLine {
  blockId: string | null;
  itemId: string | null;
  itemType: ItemType | null;
  text: string;
  /** The item's own text, when it was made from part of the line. */
  itemText: string | null;
}

export interface ChipInfo {
  type: ItemType;
  blocking: boolean;
  /** e.g. "Agreed 3 of 4", "Needs a decision". */
  status: string;
  /** Solid blue when everyone asked has agreed; dashed otherwise. */
  settled: boolean;
}

export interface LineSource {
  labels: string[];
  /** Cited, or an owned assumption: drawn solid. Unsourced lines in required sections are dashed. */
  sourced: boolean;
}

export interface NotebookView {
  sections: { name: string; required: boolean; lines: EditorLine[] }[];
  chips: Record<string, ChipInfo>;
  sources: Record<string, LineSource>;
}

const SOURCE_KIND_LABEL = { call: "Call", survey: "Survey", ticket: "Ticket", doc: "Doc", chat: "Comment", code: "Code", adr: "ADR" } as const;

export function sourceLabel(excerptId: string, ctx: DomainSnapshot): string {
  const excerpt = ctx.excerpts.find((e) => e.id === excerptId);
  const source = ctx.sources.find((s) => s.id === excerpt?.sourceId);
  if (!excerpt || !source) return excerptId;
  const kind = SOURCE_KIND_LABEL[source.kind];
  return excerpt.kind === "theme" ? kind : `${kind}, ${excerpt.locator}`;
}

export function notebookView(story: Story, ctx: DomainSnapshot, sections: string[]): NotebookView {
  const template = ctx.templates.find((t) => t.id === story.templateId);
  const required = new Set(template?.requiredSections ?? []);
  const blocks = ctx.blocks.filter((b) => b.parentType === "story" && b.parentId === story.id);
  const items = ctx.items.filter((i) => i.parentType === "story" && i.parentId === story.id && isLiveItem(i));

  const chips: Record<string, ChipInfo> = {};
  for (const i of items) {
    let status = "";
    let settled = false;
    if (i.type === "decision") {
      const current = [...latestStances(ctx.stances.filter((s) => s.itemId === i.id && s.round === i.stanceRound)).values()];
      const agreed = current.filter((s) => s.value === "agree" && i.requiredStanceIds.includes(s.personId)).length;
      status = `Agreed ${agreed} of ${i.requiredStanceIds.length}`;
      settled = agreed === i.requiredStanceIds.length && !current.some((s) => s.value === "object");
    } else if (i.type === "question") {
      status = i.status !== "open" ? "Answered" : i.blocking ? "Needs a decision" : "Open";
      settled = i.status !== "open";
    }
    chips[i.id] = { type: i.type, blocking: i.blocking, status, settled };
  }

  const sources: Record<string, LineSource> = {};
  for (const b of blocks) {
    const cites = ctx.citations.filter((c) => c.fromType === "block" && c.fromId === b.id);
    const ownedAssumption = items.some((i) => i.blockId === b.id && i.type === "assumption" && i.ownerId);
    sources[b.id] = {
      labels: cites.map((c) => (c.toType === "excerpt" ? sourceLabel(c.toId, ctx) : "Note")),
      sourced: cites.length > 0 || ownedAssumption,
    };
  }

  return {
    chips,
    sources,
    sections: sections.map((name) => ({
      name,
      required: required.has(name),
      lines: blocks
        .filter((b) => b.section === name)
        .sort((a, b) => a.order - b.order)
        .map((b) => {
          const item = items.find((i) => i.blockId === b.id);
          return { blockId: b.id, itemId: item?.id ?? null, itemType: item?.type ?? null, text: b.text, itemText: item && item.text !== b.text ? item.text : null };
        }),
    })),
  };
}
