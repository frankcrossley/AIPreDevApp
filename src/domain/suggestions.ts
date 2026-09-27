// Suggest mode (ADR-025): the story lead edits the notebook directly; everyone else's edits
// become suggestions, like tracked changes. A suggestion is a Draft of kind "suggestion", so it
// expires and is triaged like any other draft, and nothing changes until the lead accepts it.

import { draftExpiresAt, draftExpiryDays } from "./drafts";
import { diffSection, planChange, sectionLines, type ChangePlan, type NotebookOp, type SectionLine } from "./notebook";
import type { DomainSnapshot, Draft, Story, SuggestionOp } from "./types";

/** Who edits a story directly. Everyone else suggests. (Bolt 8 adds the scribe in session mode.) */
export function editsDirectly(personId: string, story: Story): boolean {
  return personId === story.leadId;
}

const keyOf = (op: SuggestionOp, blockId: string) => `${op}:${blockId}`;

interface Wanted {
  op: SuggestionOp;
  blockId: string;
  afterBlockId: string | null;
  text: string;
  itemType: string | null;
}

/** The suggestions a set of ops amounts to. Reordering alone isn't suggested. */
function wantedFrom(ops: NotebookOp[], lines: SectionLine[], ctx: DomainSnapshot): Wanted[] {
  const wanted: Wanted[] = [];
  const created = new Map<string, string>(); // blockId -> itemType
  for (const o of ops) if (o.op === "createItem" && o.item.blockId) created.set(o.item.blockId, o.item.type);
  const deleted = new Set(ops.filter((o) => o.op === "deleteBlock").map((o) => (o as { id: string }).id));
  const newBlocks = new Set<string>();
  for (const o of ops) {
    if (o.op === "createBlock") newBlocks.add(o.block.id);
  }
  const trimmed = lines.map((l) => ({ ...l, text: l.text.trim() })).filter((l) => l.text);

  for (const o of ops) {
    if (o.op === "createBlock") {
      const index = trimmed.findIndex((l) => l.blockId === o.block.id);
      const before = index > 0 ? trimmed[index - 1].blockId : null;
      wanted.push({ op: "add", blockId: o.block.id, afterBlockId: before, text: o.block.text, itemType: created.get(o.block.id) ?? null });
    } else if (o.op === "updateBlock" && o.text !== undefined) {
      wanted.push({ op: "edit", blockId: o.id, afterBlockId: null, text: o.text, itemType: null });
    } else if (o.op === "deleteBlock") {
      const text = ctx.blocks.find((b) => b.id === o.id)?.text ?? "";
      wanted.push({ op: "remove", blockId: o.id, afterBlockId: null, text, itemType: null });
    }
  }
  // Chip changes on lines that stay: archive without a new item, a new item, or a restore.
  const chipBlocks = new Set<string>();
  for (const o of ops) {
    if (o.op === "archiveItem" || o.op === "restoreItem") {
      const blockId = ctx.items.find((i) => i.id === o.id)?.blockId;
      if (blockId && !deleted.has(blockId)) chipBlocks.add(blockId);
    }
    if (o.op === "createItem" && o.item.blockId && !newBlocks.has(o.item.blockId)) chipBlocks.add(o.item.blockId);
  }
  for (const blockId of chipBlocks) {
    const line = trimmed.find((l) => l.blockId === blockId);
    wanted.push({
      op: "chip",
      blockId,
      afterBlockId: null,
      text: line?.itemText?.trim() || line?.text || "",
      itemType: line?.itemType ?? null,
    });
  }
  return wanted;
}

export interface SuggestionChanges {
  upserts: Draft[];
  withdrawIds: string[];
}

/**
 * A non-lead's section save. Works out which suggestions their lines amount to, compared with
 * the real notebook, and reconciles them with that person's pending suggestions: unchanged
 * suggestions keep their id and expiry, new ones are created, and ones they took back are withdrawn.
 */
export function toSuggestions(input: {
  ctx: DomainSnapshot;
  story: Story;
  section: string;
  lines: SectionLine[];
  authorId: string;
  now: Date;
  newId: () => string;
}): SuggestionChanges {
  const { ctx, story, section, lines, authorId, now, newId } = input;
  const ops = diffSection({ ctx, storyId: story.id, section, lines, actorId: authorId, now, newId });
  const wanted = wantedFrom(ops, lines, ctx);
  const mine = pendingSuggestions(ctx, story.id, section).filter((d) => d.authorId === authorId);
  const byKey = new Map(mine.map((d) => [keyOf(d.op!, d.blockId!), d]));

  const upserts: Draft[] = [];
  const keep = new Set<string>();
  for (const w of wanted) {
    const existing = byKey.get(keyOf(w.op, w.blockId));
    if (existing) {
      keep.add(existing.id);
      if (existing.text !== w.text || existing.itemType !== w.itemType || existing.afterBlockId !== w.afterBlockId) {
        upserts.push({ ...existing, text: w.text, itemType: w.itemType, afterBlockId: w.afterBlockId });
      }
      continue;
    }
    upserts.push({
      id: newId(),
      targetType: "story",
      targetId: story.id,
      text: w.text,
      authorId,
      excerptId: null,
      sourceId: null,
      createdAt: now,
      expiresAt: draftExpiresAt(now, draftExpiryDays({ targetType: "story", targetId: story.id }, ctx), ctx.sessions),
      status: "pending",
      triagedBy: null,
      triagedAt: null,
      resultBlockId: null,
      kind: "suggestion",
      section,
      op: w.op,
      blockId: w.blockId,
      afterBlockId: w.afterBlockId,
      itemType: w.itemType,
      hatNoteId: null,
      baseText: w.op === "edit" ? (ctx.blocks.find((b) => b.id === w.blockId)?.text ?? null) : null,
    });
  }
  return { upserts, withdrawIds: mine.filter((d) => !keep.has(d.id)).map((d) => d.id) };
}

export function pendingSuggestions(ctx: DomainSnapshot, storyId: string, section?: string): Draft[] {
  return ctx.drafts
    .filter((d) => d.kind === "suggestion" && d.status === "pending" && d.targetId === storyId && (!section || d.section === section))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
}

/** Where an added line goes: after its anchor, or after whatever that anchor was added after. */
function resolveAfter(afterBlockId: string | null, lines: SectionLine[], ctx: DomainSnapshot): number {
  let anchor = afterBlockId;
  const seen = new Set<string>();
  while (anchor && !seen.has(anchor)) {
    const at = lines.findIndex((l) => l.blockId === anchor);
    if (at >= 0) return at + 1;
    seen.add(anchor);
    anchor = ctx.drafts.find((d) => d.kind === "suggestion" && d.op === "add" && d.blockId === anchor)?.afterBlockId ?? null;
  }
  return afterBlockId ? lines.length : 0;
}

/** Applies suggestions to a section's lines, in order. Used for the author's own view and on accept. */
export function applySuggestions(lines: SectionLine[], suggestions: Draft[], ctx: DomainSnapshot): SectionLine[] {
  let out = [...lines];
  for (const d of suggestions) {
    const at = out.findIndex((l) => l.blockId === d.blockId);
    if (d.op === "add") {
      if (at >= 0) continue;
      const line: SectionLine = { blockId: d.blockId, itemId: null, itemType: d.itemType, text: d.text };
      const pos = resolveAfter(d.afterBlockId, out, ctx);
      out = [...out.slice(0, pos), line, ...out.slice(pos)];
    } else if (at >= 0 && d.op === "edit") {
      out[at] = { ...out[at], text: d.text };
    } else if (at >= 0 && d.op === "remove") {
      out = out.filter((_, i) => i !== at);
    } else if (at >= 0 && d.op === "chip") {
      const same = d.itemType === out[at].itemType;
      out[at] = {
        ...out[at],
        itemType: d.itemType,
        itemId: same ? out[at].itemId : null,
        itemText: d.itemType && d.text !== out[at].text ? d.text : undefined,
      };
    }
  }
  return out;
}

export type AcceptedSuggestion = ChangePlan;

/** What accepting one suggestion does to the notebook, with its reopen and dependent impact. */
export function acceptSuggestion(draft: Draft, ctx: DomainSnapshot, now: Date, newId: () => string): AcceptedSuggestion {
  if (draft.kind !== "suggestion" || !draft.section || !draft.op || !draft.blockId) throw new Error("Not a suggestion");
  const story = ctx.stories.find((s) => s.id === draft.targetId);
  if (!story) throw new Error("The story this suggestion is for no longer exists");
  const base = sectionLines(story.id, draft.section, ctx);
  if (draft.op !== "add" && !base.some((l) => l.blockId === draft.blockId)) {
    throw new Error("The line this suggestion changes is gone. Reject it instead.");
  }
  const current = base.find((l) => l.blockId === draft.blockId);
  if (draft.op === "edit" && draft.baseText !== null && current && current.text !== draft.baseText) {
    throw new Error("The line has changed since this was suggested. Reject it, and ask for a fresh suggestion.");
  }
  const next = applySuggestions(base, [draft], ctx);
  const ops = diffSection({ ctx, storyId: story.id, section: draft.section, lines: next, actorId: draft.authorId ?? story.leadId, now, newId });
  return planChange(ops, story, ctx, "Accepting");
}

/** How a suggestion reads on its card and under its line. */
export function describeSuggestion(draft: Draft): string {
  const chip = draft.itemType ? draft.itemType.replace("_", " ") : null;
  switch (draft.op) {
    case "add":
      return chip ? `Add a ${chip}: ${draft.text}` : `Add: ${draft.text}`;
    case "edit":
      return `Change to: ${draft.text}`;
    case "remove":
      return `Remove: ${draft.text}`;
    case "chip":
      return chip ? `Make this a ${chip}${draft.text ? `: ${draft.text}` : ""}` : "Turn back into plain text";
    default:
      return draft.text;
  }
}
