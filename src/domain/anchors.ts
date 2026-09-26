// Where on the notebook a check's fixTarget lives, as a DOM id the UI can scroll to.
import type { DomainSnapshot, FixTarget } from "./types";

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
