// The notebook's rules (02-notebook, ADR-020, ADR-021). Pure: the editor sends a section's lines,
// diffSection works out what changed, and the server applies the ops.

import { isLiveItem, latestStances } from "./checks";
import { STATE_LABELS } from "./backlog";
import { nextStoryKey } from "./story-keys";
import type { Block, Citation, DomainSnapshot, Epic, Item, ItemType, Stance, Story } from "./types";

export type ChipType = "decision" | "question" | "assumption" | "risk";

const PREFIXES: [RegExp, ChipType][] = [
  [/^decision:\s*/i, "decision"],
  [/^\?\s+/, "question"],
  [/^assume:\s*/i, "assumption"],
  [/^risk:\s*/i, "risk"],
];

/** `decision:`, `?`, `assume:` or `risk:` at the start of a line, followed by text. */
export function parsePrefix(line: string): { type: ChipType; text: string } | null {
  for (const [re, type] of PREFIXES) {
    const m = line.match(re);
    if (m) {
      const text = line.slice(m[0].length).trim();
      return text ? { type, text } : null;
    }
  }
  return null;
}

/** One line of a section as the editor sends it. */
export interface SectionLine {
  blockId: string | null;
  /** The live item on this line, if it has a chip already. */
  itemId: string | null;
  /** The chip on this line. Null for plain text. */
  itemType: ItemType | null;
  text: string;
  /** "Turn into" on a selection: the item's own text, when it's only part of the line. */
  itemText?: string;
}

export type NotebookOp =
  | { op: "createBlock"; block: Block }
  | { op: "updateBlock"; id: string; text?: string; order?: number }
  | { op: "deleteBlock"; id: string }
  | { op: "createItem"; item: Item }
  | { op: "updateItem"; id: string; text: string }
  | { op: "archiveItem"; id: string }
  | { op: "restoreItem"; id: string };

/** Ids the editor may assign to new lines and chips. */
const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

const unique = (xs: string[]) => [...new Set(xs)];

/** Who must give a stance on a new decision: the story lead, its author, and the epic's tech lead (ADR-022). */
export function defaultRequiredStances(story: Story, authorId: string, ctx: DomainSnapshot): string[] {
  const epic = ctx.epics.find((e) => e.id === story.epicId);
  const techLead = epic?.memberIds.find((id) => ctx.people.find((p) => p.id === id)?.role === "tech_lead");
  return unique([story.leadId, authorId, ...(techLead ? [techLead] : [])]).filter((id) =>
    ctx.people.some((p) => p.id === id),
  );
}

interface DiffInput {
  ctx: DomainSnapshot;
  storyId: string;
  section: string;
  lines: SectionLine[];
  actorId: string;
  now: Date;
  newId: () => string;
}

export function diffSection({ ctx, storyId, section, lines, actorId, now, newId }: DiffInput): NotebookOp[] {
  const story = ctx.stories.find((s) => s.id === storyId);
  if (!story) throw new Error(`No story ${storyId}`);
  const existing = ctx.blocks.filter((b) => b.parentType === "story" && b.parentId === storyId && b.section === section);
  const byId = new Map(existing.map((b) => [b.id, b]));
  const liveItemOn = (blockId: string) => ctx.items.find((i) => i.blockId === blockId && isLiveItem(i));

  const kept = lines
    .map((l) => ({ ...l, text: l.text.trim() }))
    .filter((l) => l.text.length > 0);
  const allBlockIds = new Set(ctx.blocks.map((b) => b.id));
  const allItems = new Map(ctx.items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  for (const l of kept) {
    if (!l.blockId) continue;
    if (seen.has(l.blockId)) throw new Error(`Block ${l.blockId} appears twice`);
    seen.add(l.blockId);
    if (byId.has(l.blockId)) continue;
    if (allBlockIds.has(l.blockId)) throw new Error(`Block ${l.blockId} isn't in ${section} on ${story.key}`);
    if (!CLIENT_ID.test(l.blockId)) throw new Error(`Invalid block id ${l.blockId}`);
  }

  const ops: NotebookOp[] = [];
  const keptIds = new Set(kept.map((l) => l.blockId).filter(Boolean));
  for (const b of existing.sort((a, c) => a.order - c.order)) {
    if (keptIds.has(b.id)) continue;
    const item = liveItemOn(b.id);
    if (item) ops.push({ op: "archiveItem", id: item.id });
    ops.push({ op: "deleteBlock", id: b.id });
  }

  kept.forEach((line, index) => {
    const order = index + 1;
    // Chips come only from the editor (a typed prefix, "Turn into"). Saved text that starts
    // with "risk:" stays plain text, so a prefix can always be escaped (ADR-027).
    const itemType = line.itemType;
    const text = line.text;

    let blockId = line.blockId;
    let previous: Block | undefined;
    if (!blockId || !byId.has(blockId)) {
      blockId = blockId ?? newId();
      ops.push({
        op: "createBlock",
        block: { id: blockId, parentType: "story", parentId: storyId, section, order, text, authorId: actorId, createdAt: now, updatedAt: now },
      });
    } else {
      previous = byId.get(blockId)!;
      const change: { text?: string; order?: number } = {};
      if (previous.text !== text) change.text = text;
      if (previous.order !== order) change.order = order;
      if (Object.keys(change).length) ops.push({ op: "updateBlock", id: blockId, ...change });
    }

    const current = previous ? liveItemOn(blockId) : undefined;
    // A line with no item id but the same chip type keeps its item (e.g. an edit that didn't touch the chip).
    const keeps = current && current.type === itemType && (line.itemId === null || line.itemId === current.id);
    if (current && !keeps) ops.push({ op: "archiveItem", id: current.id });
    if (current && keeps) {
      // The item follows the line's text unless it was made from part of the line.
      if (current.text === previous!.text && previous!.text !== text) {
        ops.push({ op: "updateItem", id: current.id, text });
      }
      return;
    }
    if (!itemType) return;
    const known = line.itemId ? allItems.get(line.itemId) : undefined;
    if (known) {
      // Undoing "Turn back into plain text" brings the archived item back, with its history.
      if (known.status === "archived" && known.blockId === blockId && known.type === itemType) {
        ops.push({ op: "restoreItem", id: known.id });
        return;
      }
    }
    if (line.itemId && !known && !CLIENT_ID.test(line.itemId)) throw new Error(`Invalid item id ${line.itemId}`);
    ops.push({
      op: "createItem",
      item: {
        id: line.itemId && !known ? line.itemId : newId(),
        parentType: "story",
        parentId: storyId,
        blockId,
        type: itemType,
        text: line.itemText?.trim() || text,
        status: "open",
        ownerId: actorId,
        blocking: false,
        requiredStanceIds: itemType === "decision" ? defaultRequiredStances(story, actorId, ctx) : [],
        stanceRound: 1,
      },
    });
  });
  return ops;
}

/** Applies ops to a snapshot copy. The server does the same against the database. */
export function applyOps(ctx: DomainSnapshot, ops: NotebookOp[], now: Date): DomainSnapshot {
  let blocks = [...ctx.blocks];
  let items = [...ctx.items];
  for (const o of ops) {
    if (o.op === "createBlock") blocks.push(o.block);
    if (o.op === "updateBlock") blocks = blocks.map((b) => (b.id === o.id ? { ...b, ...(o.text !== undefined && { text: o.text }), ...(o.order !== undefined && { order: o.order }), updatedAt: now } : b));
    if (o.op === "deleteBlock") blocks = blocks.filter((b) => b.id !== o.id);
    if (o.op === "createItem") items.push(o.item);
    if (o.op === "updateItem") items = items.map((i) => (i.id === o.id ? { ...i, text: o.text } : i));
    if (o.op === "archiveItem") items = items.map((i) => (i.id === o.id ? { ...i, status: "archived" as const } : i));
    if (o.op === "restoreItem") items = items.map((i) => (i.id === o.id ? { ...i, status: "open" as const } : i));
  }
  return { ...ctx, blocks, items };
}

/** Marks a question as blocking or not. Only questions can block. */
export function setBlocking(item: Item, blocking: boolean): Item {
  if (item.type !== "question") throw new Error("Only a question can be marked blocking");
  return { ...item, blocking };
}

const agreeingIn = (item: Item, stances: Stance[]) =>
  [...latestStances(stances.filter((s) => s.itemId === item.id && s.round === item.stanceRound)).values()]
    .filter((s) => s.value === "agree")
    .map((s) => s.personId);

/**
 * Everyone whose agreement an edit to these blocks would reopen, in the order they were asked.
 * Once a story is agreed, ready or exported, every line counts as agreed content (ADR-015).
 */
export function agreedBy(blockIds: string[], storyId: string, ctx: DomainSnapshot): string[] {
  const story = ctx.stories.find((s) => s.id === storyId);
  if (!story) return [];
  const decisions = ctx.items.filter(
    (i) => i.parentType === "story" && i.parentId === storyId && i.type === "decision" && isLiveItem(i),
  );
  const storyAgreed = ["agreed", "ready", "exported"].includes(story.state);
  const touched = storyAgreed ? decisions : decisions.filter((i) => i.blockId && blockIds.includes(i.blockId));
  const people: string[] = [];
  for (const item of touched) {
    const agreed = agreeingIn(item, ctx.stances);
    for (const p of [...item.requiredStanceIds, ...agreed]) if (agreed.includes(p)) people.push(p);
  }
  if (storyAgreed && story.signedOffBy) people.push(story.signedOffBy);
  return unique(people);
}

/** The blocks an op list edits in a way that changes agreed content. */
export function editedBlockIds(ops: NotebookOp[], ctx: DomainSnapshot): string[] {
  const ids: string[] = [];
  for (const o of ops) {
    if (o.op === "updateBlock" && o.text !== undefined) ids.push(o.id);
    if (o.op === "deleteBlock") ids.push(o.id);
    if (o.op === "updateItem" || o.op === "archiveItem" || o.op === "restoreItem") {
      const blockId = ctx.items.find((i) => i.id === o.id)?.blockId;
      if (blockId) ids.push(blockId);
    }
  }
  return unique(ids);
}

const COUNT_WORDS = ["", "", "both", "all three", "all four", "all five", "all six", "all seven", "all eight", "all nine", "all ten"];

export const listNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** "Priya, Sam and Dan agreed this. Saving reopens it for all three." */
export function reopenWarning(names: string[], verb: "Saving" | "Accepting" = "Saving"): string {
  if (!names.length) return "";
  const who = names.length === 1 ? "them" : (COUNT_WORDS[names.length] ?? `all ${names.length}`);
  return `${listNames(names)} agreed this. ${verb} reopens it for ${who}.`;
}

const AGREED_STATES = new Set(["agreed", "ready", "exported"]);

export interface ReopenImpact {
  /** True when saving these ops must reopen the story (rule 5, ADR-015). */
  reopen: boolean;
  /** What changed, for reopenOnEdit. */
  editedIds: string[];
  personIds: string[];
  warning: string;
}

/**
 * Whether a set of notebook ops edits agreed content, who agreed it, and the warning to show.
 * Once a story is agreed, ready or exported, any change at all reopens it, including new lines.
 */
export function reopenImpact(
  ops: NotebookOp[],
  story: Story,
  ctx: DomainSnapshot,
  verb: "Saving" | "Accepting" = "Saving",
): ReopenImpact {
  const name = (id: string) => ctx.people.find((p) => p.id === id)?.name ?? id;
  if (AGREED_STATES.has(story.state)) {
    const personIds = ops.length ? agreedBy([], story.id, ctx) : [];
    return {
      reopen: ops.length > 0,
      editedIds: [story.id],
      personIds,
      warning: !ops.length
        ? ""
        : personIds.length
          ? reopenWarning(personIds.map(name), verb)
          : `${story.key} is ${STATE_LABELS[story.state]}. ${verb} reopens it.`,
    };
  }
  const editedIds = editedBlockIds(ops, ctx);
  const personIds = agreedBy(editedIds, story.id, ctx);
  return { reopen: personIds.length > 0, editedIds, personIds, warning: reopenWarning(personIds.map(name), verb) };
}

/**
 * "Turn into → Story": a draft story in the same epic, led by whoever made it, with the selected
 * text as its title. Its first line quotes the selection and cites the line it came from.
 */
export function newDraftStory(input: {
  epic: Epic;
  ctx: DomainSnapshot;
  title: string;
  actorId: string;
  sourceBlockId: string | null;
  now: Date;
}): { story: Story; block: Block | null; citation: Citation | null } {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (!title) throw new Error("A story needs a title");
  if (title.length > 200) throw new Error("A story title can be at most 200 characters");
  const template = input.ctx.templates.find((t) => t.name === "story") ?? input.ctx.templates[0];
  const key = nextStoryKey(input.epic, input.ctx);
  const id = key.toLowerCase();
  const story: Story = {
    id,
    key,
    epicId: input.epic.id,
    title,
    leadId: input.actorId,
    templateId: template.id,
    state: "draft",
    promiseId: null,
    estimate: null,
    hasUiChange: false,
    mockUri: null,
    jiraKey: null,
    sprint: null,
    signedOffBy: null,
    signedOffAt: null,
  };
  const source = input.sourceBlockId ? input.ctx.blocks.find((b) => b.id === input.sourceBlockId) : undefined;
  if (!source) return { story, block: null, citation: null };
  const block: Block = {
    id: `${id}-b1`,
    parentType: "story",
    parentId: id,
    section: template.sections[0],
    order: 1,
    text: title,
    authorId: input.actorId,
    createdAt: input.now,
    updatedAt: input.now,
  };
  return {
    story,
    block,
    citation: { id: `cit-block-${block.id}-${source.id}`, fromType: "block", fromId: block.id, toType: "block", toId: source.id },
  };
}

// ---------- deleting a line others depend on (ADR-026) ----------

export interface Dependent {
  type: "block" | "criterion" | "item";
  id: string;
  storyId: string;
  text: string;
  /** Who is asked to realign it. */
  ownerId: string;
}

/** Lines, criteria and items that cite a block. */
export function dependentsOf(blockId: string, ctx: DomainSnapshot): Dependent[] {
  const out: Dependent[] = [];
  for (const c of ctx.citations.filter((x) => x.toType === "block" && x.toId === blockId)) {
    if (c.fromType === "block") {
      const b = ctx.blocks.find((x) => x.id === c.fromId);
      if (b && b.parentType === "story") out.push({ type: "block", id: b.id, storyId: b.parentId, text: b.text, ownerId: b.authorId });
    } else if (c.fromType === "criterion") {
      const cr = ctx.criteria.find((x) => x.id === c.fromId);
      const lead = ctx.stories.find((s) => s.id === cr?.storyId)?.leadId;
      if (cr && lead) out.push({ type: "criterion", id: cr.id, storyId: cr.storyId, text: `Given ${cr.given}, then ${cr.then}`, ownerId: lead });
    } else if (c.fromType === "item") {
      const it = ctx.items.find((x) => x.id === c.fromId);
      if (it && isLiveItem(it) && it.parentType === "story") out.push({ type: "item", id: it.id, storyId: it.parentId, text: it.text, ownerId: it.ownerId ?? "" });
    }
  }
  return out;
}

export interface DeleteImpact {
  /** Deleted blocks that others cite, with what cites them. */
  affected: { blockId: string; text: string; dependents: Dependent[] }[];
  warning: string;
}

const clip = (t: string, n = 60) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** What a set of ops would leave unsourced, and the warning that says so before anyone confirms. */
export function deleteImpact(ops: NotebookOp[], ctx: DomainSnapshot): DeleteImpact {
  const affected = ops
    .filter((o): o is { op: "deleteBlock"; id: string } => o.op === "deleteBlock")
    .map((o) => ({ blockId: o.id, text: ctx.blocks.find((b) => b.id === o.id)?.text ?? o.id, dependents: dependentsOf(o.id, ctx) }))
    .filter((a) => a.dependents.length > 0);
  const warning = affected
    .map((a) => {
      const n = a.dependents.length;
      return `${n} ${n === 1 ? "thing cites" : "things cite"} "${clip(a.text)}": ${a.dependents.map((d) => `"${clip(d.text, 40)}"`).join(", ")}. Deleting it leaves ${n === 1 ? "it" : "them"} unsourced, and each gets a talking point to realign.`;
    })
    .join(" ");
  return { affected, warning };
}

/** The realignment talking points a confirmed delete creates, one per dependent. */
export function realignmentItems(impact: DeleteImpact, newId: () => string): { item: Item; citation: Citation | null }[] {
  return impact.affected.flatMap((a) =>
    a.dependents.map((d) => {
      const id = newId();
      const item: Item = {
        id,
        parentType: "story",
        parentId: d.storyId,
        blockId: null,
        type: "talking_point",
        text: `Realign: "${clip(d.text)}" lost its source "${clip(a.text)}"`,
        status: "open",
        ownerId: d.ownerId || null,
        blocking: false,
        requiredStanceIds: [],
        stanceRound: 1,
      };
      // Points the talking point at the thing to realign, so the panel can link to it.
      const citation: Citation | null =
        d.type === "block" ? { id: `cit-item-${id}-${d.id}`, fromType: "item", fromId: id, toType: "block", toId: d.id } : null;
      return { item, citation };
    }),
  );
}

/** A section's current lines, as the editor would send them. */
export function sectionLines(storyId: string, section: string, ctx: DomainSnapshot): SectionLine[] {
  return ctx.blocks
    .filter((b) => b.parentType === "story" && b.parentId === storyId && b.section === section)
    .sort((a, b) => a.order - b.order)
    .map((b) => {
      const item = ctx.items.find((i) => i.blockId === b.id && isLiveItem(i));
      return {
        blockId: b.id,
        itemId: item?.id ?? null,
        itemType: item?.type ?? null,
        text: b.text,
        itemText: item && item.text !== b.text ? item.text : undefined,
      };
    });
}

// ---------- one plan for every notebook change ----------

export interface ChangePlan {
  ops: NotebookOp[];
  reopen: ReopenImpact;
  deletes: DeleteImpact;
  /** True when a person must confirm first: the change reopens agreed content or orphans citations. */
  needsConfirmation: boolean;
  warning: string;
}

/**
 * Every path that changes a story's notebook (saving, accepting, merging, answering, blocking)
 * goes through this, so the reopen rule (ADR-015) and the dependent check (ADR-026) always apply.
 */
export function planChange(ops: NotebookOp[], story: Story, ctx: DomainSnapshot, verb: "Saving" | "Accepting" = "Saving"): ChangePlan {
  const reopen = reopenImpact(ops, story, ctx, verb);
  const deletes = deleteImpact(ops, ctx);
  return {
    ops,
    reopen,
    deletes,
    needsConfirmation: reopen.reopen || deletes.affected.length > 0,
    warning: [reopen.reopen ? reopen.warning : "", deletes.warning].filter(Boolean).join(" "),
  };
}
