// Triage: only the target's lead decides what happens to a draft (docs/domain.md "Draft rules").
// Accepting adds new, unagreed content; it never edits agreed content directly (rule 6).

import { draftExpiresAt, draftExpiryDays } from "./drafts";
import { agreedBy, diffSection, parsePrefix, reopenImpact, sectionLines, type NotebookOp, type ReopenImpact } from "./notebook";
import type { Citation, DomainSnapshot, Draft } from "./types";

export type Permission = { ok: true } | { ok: false; reason: string };

/** The person who triages drafts on this target: the story lead, or the epic owner. */
export function triagerOf(draft: Pick<Draft, "targetType" | "targetId">, ctx: DomainSnapshot): string | null {
  if (draft.targetType === "story") return ctx.stories.find((s) => s.id === draft.targetId)?.leadId ?? null;
  if (draft.targetType === "epic") return ctx.epics.find((e) => e.id === draft.targetId)?.ownerId ?? null;
  return null;
}

export function canTriage(personId: string, draft: Draft, ctx: DomainSnapshot): Permission {
  const lead = triagerOf(draft, ctx);
  if (!lead) return { ok: false, reason: "This draft has no target yet" };
  if (personId !== lead) return { ok: false, reason: `${ctx.people.find((p) => p.id === lead)?.name ?? lead} is the lead` };
  if (draft.status !== "pending" && draft.status !== "expired") return { ok: false, reason: `Already ${draft.status}` };
  return { ok: true };
}

/** Where an accepted note lands: quotes from sources under the first section, people's notes under "What we think". */
export function defaultSection(draft: Draft, sections: string[]): string {
  if (draft.excerptId || draft.sourceId) return sections[0];
  return sections.includes("What we think") ? "What we think" : sections[0];
}

export interface Triaged {
  draft: Draft;
  ops: NotebookOp[];
  citations: Citation[];
  impact: ReopenImpact | null;
}

function storyOf(draft: Draft, ctx: DomainSnapshot) {
  if (draft.targetType !== "story") throw new Error("Epic notes are triaged from the PRFAQ, which arrives in a later build");
  const story = ctx.stories.find((s) => s.id === draft.targetId);
  if (!story) throw new Error("The story this draft is for no longer exists");
  const template = ctx.templates.find((t) => t.id === story.templateId);
  return { story, sections: (template?.sections ?? []).filter((s) => s !== "Acceptance criteria") };
}

const quoteCitation = (draft: Draft, blockId: string): Citation[] =>
  draft.excerptId ? [{ id: `cit-block-${blockId}-${draft.excerptId}`, fromType: "block", fromId: blockId, toType: "excerpt", toId: draft.excerptId }] : [];

/** Accepts a note as a new, unagreed line at the end of a section (quotes keep their source). */
export function acceptNote(
  draft: Draft,
  ctx: DomainSnapshot,
  opts: { actorId: string; now: Date; newId: () => string; section?: string },
): Triaged {
  if (draft.kind !== "note") throw new Error("Use acceptSuggestion for suggestions");
  const { story, sections } = storyOf(draft, ctx);
  const section = opts.section ?? defaultSection(draft, sections);
  if (!sections.includes(section)) throw new Error(`${section} isn't a section of ${story.key}`);
  const parsed = parsePrefix(draft.text);
  const blockId = opts.newId();
  const lines = [...sectionLines(story.id, section, ctx), { blockId, itemId: null, itemType: parsed?.type ?? null, text: parsed?.text ?? draft.text }];
  const ops = diffSection({ ctx, storyId: story.id, section, lines, actorId: draft.authorId ?? opts.actorId, now: opts.now, newId: opts.newId });
  return {
    draft: { ...draft, status: "accepted", triagedBy: opts.actorId, triagedAt: opts.now, resultBlockId: blockId },
    ops,
    citations: quoteCitation(draft, blockId),
    impact: reopenImpact(ops, story, ctx, "Accepting"),
  };
}

/** Lines a note can merge into. Agreed lines are offered but disabled: merging would reopen them. */
export function mergeTargets(draft: Draft, ctx: DomainSnapshot): { blockId: string; text: string; disabledReason: string | null }[] {
  if (draft.targetType !== "story") return [];
  const { story } = storyOf(draft, ctx);
  return ctx.blocks
    .filter((b) => b.parentType === "story" && b.parentId === story.id)
    .sort((a, b) => a.section.localeCompare(b.section) || a.order - b.order)
    .map((b) => ({
      blockId: b.id,
      text: b.text,
      disabledReason: agreedBy([b.id], story.id, ctx).length
        ? "Agreed. Merging would reopen it; accept it as a new line instead"
        : null,
    }));
}

/** Merges a note into an unagreed line: its text is appended, and a quote keeps its source. */
export function mergeNote(draft: Draft, intoBlockId: string, ctx: DomainSnapshot, opts: { actorId: string; now: Date; newId: () => string }): Triaged {
  const { story } = storyOf(draft, ctx);
  const target = mergeTargets(draft, ctx).find((t) => t.blockId === intoBlockId);
  if (!target) throw new Error("That line isn't on this story");
  if (target.disabledReason) throw new Error(target.disabledReason);
  const block = ctx.blocks.find((b) => b.id === intoBlockId)!;
  const lines = sectionLines(story.id, block.section, ctx).map((l) =>
    l.blockId === intoBlockId ? { ...l, text: `${l.text.replace(/\s+$/, "")} ${draft.text}` } : l,
  );
  const ops = diffSection({ ctx, storyId: story.id, section: block.section, lines, actorId: opts.actorId, now: opts.now, newId: opts.newId });
  return {
    draft: { ...draft, status: "merged", triagedBy: opts.actorId, triagedAt: opts.now, resultBlockId: intoBlockId },
    ops,
    citations: quoteCitation(draft, intoBlockId),
    impact: null,
  };
}

export function rejectDraft(draft: Draft, actorId: string, now: Date): Draft {
  return { ...draft, status: "rejected", triagedBy: actorId, triagedAt: now };
}

/** Moves a draft to another story or epic. Its expiry is worked out again for the new target. */
export function moveDraft(draft: Draft, toId: string, ctx: DomainSnapshot): Draft {
  const targetType = ctx.stories.some((s) => s.id === toId) ? "story" : ctx.epics.some((e) => e.id === toId) ? "epic" : null;
  if (!targetType) throw new Error(`No story or epic ${toId}`);
  if (draft.kind !== "note") throw new Error("A suggestion belongs to its line and can't be moved");
  const target = { targetType, targetId: toId } as const;
  return { ...draft, ...target, expiresAt: draftExpiresAt(draft.createdAt, draftExpiryDays(target, ctx), ctx.sessions) };
}
