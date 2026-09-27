"use server";
// Server actions for the workspace. Each one records the "viewing as" person (ADR-003)
// and hands the rules to src/domain through src/server.
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { SectionLine } from "@/domain/notebook";
import { VIEWING_AS_COOKIE, currentActorId } from "@/server/actor";
import { prisma } from "@/server/db";
import { createDraftStory } from "@/server/lifecycle";
import { saveSection, setItemBlocking, type SaveResult } from "@/server/notebook";
import {
  acceptDraftAction,
  answerHatNoteAction,
  dismissHatNoteAction,
  mergeDraftAction,
  moveDraftAction,
  putToSessionAction,
  rejectDraftAction,
  restoreDraftAction,
  withdrawSuggestionAction,
  type ActionResult,
} from "@/server/triage";

const refresh = () => revalidatePath("/w", "layout");

async function actor() {
  const people = await prisma.person.findMany();
  return currentActorId(people.map((p) => ({ ...p, role: p.role as never })));
}

export async function setViewingAs(personId: string): Promise<void> {
  if (!(await prisma.person.findUnique({ where: { id: personId } }))) throw new Error(`No person ${personId}`);
  (await cookies()).set(VIEWING_AS_COOKIE, personId, { path: "/", sameSite: "lax" });
  refresh();
}

function checkLines(lines: unknown): SectionLine[] {
  if (!Array.isArray(lines)) throw new Error("lines must be an array");
  return lines.map((l) => {
    const x = l as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    if (typeof x.text !== "string") throw new Error("Each line needs text");
    return { blockId: str(x.blockId), itemId: str(x.itemId), itemType: str(x.itemType), text: x.text, itemText: str(x.itemText) ?? undefined };
  });
}

export async function saveSectionAction(storyId: string, section: string, lines: unknown, confirmReopen: boolean): Promise<SaveResult> {
  const result = await saveSection(prisma, { storyId, section, lines: checkLines(lines), actorId: await actor(), confirmReopen });
  if (result.status !== "needs_confirmation") refresh();
  return result;
}

export async function setBlockingAction(itemId: string, blocking: boolean): Promise<void> {
  await setItemBlocking(prisma, itemId, blocking, await actor());
  refresh();
}

export async function createStoryAction(epicId: string, title: string, sourceBlockId: string | null): Promise<{ key: string }> {
  const { key } = await createDraftStory(prisma, { epicId, title, sourceBlockId, actorId: await actor() });
  refresh();
  return { key };
}

// ---------- right panel: triage, suggestions, hat notes, session ----------

export async function acceptDraftActionUI(draftId: string, confirmReopen: boolean, section?: string): Promise<ActionResult> {
  const r = await acceptDraftAction(prisma, { draftId, actorId: await actor(), confirmReopen, section });
  if (r.status === "done") refresh();
  return r;
}

export async function mergeDraftActionUI(draftId: string, intoBlockId: string): Promise<ActionResult> {
  const r = await mergeDraftAction(prisma, { draftId, intoBlockId, actorId: await actor() });
  if (r.status === "done") refresh();
  return r;
}

export async function rejectDraftActionUI(draftId: string): Promise<ActionResult> {
  const r = await rejectDraftAction(prisma, { draftId, actorId: await actor() });
  if (r.status === "done") refresh();
  return r;
}

export async function moveDraftActionUI(draftId: string, toId: string): Promise<ActionResult> {
  const r = await moveDraftAction(prisma, { draftId, toId, actorId: await actor() });
  if (r.status === "done") refresh();
  return r;
}

export async function restoreDraftActionUI(draftId: string): Promise<ActionResult> {
  const r = await restoreDraftAction(prisma, { draftId, actorId: await actor() });
  if (r.status === "done") refresh();
  return r;
}

export async function withdrawSuggestionActionUI(draftId: string): Promise<ActionResult> {
  const r = await withdrawSuggestionAction(prisma, { draftId, actorId: await actor() });
  if (r.status === "done") refresh();
  return r;
}

export async function answerHatNoteActionUI(noteId: string, text: string, asQuestion: boolean): Promise<ActionResult> {
  const r = await answerHatNoteAction(prisma, { noteId, text, asQuestion, actorId: await actor() });
  if (r.status === "done") refresh();
  return r;
}

export async function dismissHatNoteActionUI(noteId: string): Promise<ActionResult> {
  const r = await dismissHatNoteAction(prisma, { noteId, actorId: await actor() });
  if (r.status === "done") refresh();
  return r;
}

export async function putToSessionActionUI(sessionId: string, subjectId: string, storyId: string): Promise<ActionResult> {
  const r = await putToSessionAction(prisma, { sessionId, subjectId, storyId, actorId: await actor() });
  if (r.status === "done") refresh();
  return r;
}
