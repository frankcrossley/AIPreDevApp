// What the notebook shows for a story: its lines per section, each chip's status, and where
// each line is sourced from. Computed here so the UI only displays it.

import { isLiveItem, latestStances } from "./checks";
import { expiryLabel } from "./drafts";
import { sectionLines } from "./notebook";
import { applySuggestions, describeSuggestion, editsDirectly, pendingSuggestions } from "./suggestions";
import { canTriage } from "./triage";
import type { DomainSnapshot, Draft, ItemType, Story } from "./types";

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

/** Someone else's suggestion, shown under the line it's about (ADR-025). */
export interface SuggestionView {
  id: string;
  author: string;
  description: string;
  expiry: string;
  /** Why the viewer can't accept or reject it, or null when they can. */
  triageReason: string | null;
}

export interface NotebookView {
  /** `direct` for the lead; `suggesting` for everyone else. */
  mode: "direct" | "suggesting";
  lead: string;
  sections: {
    name: string;
    required: boolean;
    lines: EditorLine[];
    /** Suggested additions at the top of the section. */
    topSuggestions: SuggestionView[];
    /** The viewer's own suggested removals, which their editor no longer shows. */
    ownRemovals: { id: string; text: string }[];
  }[];
  /** Other people's suggestions, keyed by the line they sit under. */
  suggestionsUnder: Record<string, SuggestionView[]>;
  /** The viewer's own suggested lines: drawn dashed with this label. */
  ownSuggested: Record<string, string>;
  chips: Record<string, ChipInfo>;
  sources: Record<string, LineSource>;
  /** Criteria a hat proposed that no person has confirmed yet: drawn dashed. */
  unconfirmedCriteria: string[];
}

const SOURCE_KIND_LABEL = { call: "Call", survey: "Survey", ticket: "Ticket", doc: "Doc", chat: "Comment", code: "Code", adr: "ADR" } as const;

export function sourceLabel(excerptId: string, ctx: DomainSnapshot): string {
  const excerpt = ctx.excerpts.find((e) => e.id === excerptId);
  const source = ctx.sources.find((s) => s.id === excerpt?.sourceId);
  if (!excerpt || !source) return excerptId;
  const kind = SOURCE_KIND_LABEL[source.kind];
  return excerpt.kind === "theme" ? kind : `${kind}, ${excerpt.locator}`;
}

export function notebookView(story: Story, ctx: DomainSnapshot, sections: string[], actorId: string = story.leadId, now: Date = new Date()): NotebookView {
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

  const mode = editsDirectly(actorId, story) ? "direct" : "suggesting";
  const name = (id: string | null) => ctx.people.find((p) => p.id === id)?.name ?? id ?? "Someone";
  const suggestions = pendingSuggestions(ctx, story.id).filter((d) => d.expiresAt.getTime() > now.getTime());
  const mine = suggestions.filter((d) => d.authorId === actorId && mode === "suggesting");
  const others = suggestions.filter((d) => !mine.includes(d));
  const toView = (d: Draft): SuggestionView => {
    const permission = canTriage(actorId, d, ctx);
    return { id: d.id, author: name(d.authorId), description: describeSuggestion(d), expiry: expiryLabel(d, now), triageReason: permission.ok ? null : permission.reason };
  };

  const suggestionsUnder: Record<string, SuggestionView[]> = {};
  for (const d of others) {
    const under = d.op === "add" ? d.afterBlockId : d.blockId;
    if (under) (suggestionsUnder[under] ??= []).push(toView(d));
  }
  const ownSuggested: Record<string, string> = {};
  for (const d of mine) {
    if (d.op !== "remove" && d.blockId) ownSuggested[d.blockId] = `Your suggestion · ${expiryLabel(d, now)}`;
  }

  return {
    mode,
    lead: name(story.leadId),
    chips,
    sources,
    suggestionsUnder,
    ownSuggested,
    unconfirmedCriteria: ctx.criteria.filter((c) => c.storyId === story.id && c.origin === "hat" && !c.confirmedBy).map((c) => c.id),
    sections: sections.map((section) => {
      const own = mine.filter((d) => d.section === section);
      const lines = applySuggestions(sectionLines(story.id, section, ctx), own, ctx).map((l) => ({
        blockId: l.blockId,
        itemId: l.itemId,
        itemType: l.itemType,
        text: l.text,
        itemText: l.itemText ?? null,
      }));
      return {
        name: section,
        required: required.has(section),
        lines,
        topSuggestions: others.filter((d) => d.section === section && d.op === "add" && !d.afterBlockId).map(toView),
        ownRemovals: own.filter((d) => d.op === "remove").map((d) => ({ id: d.id, text: d.text })),
      };
    }),
  };
}
