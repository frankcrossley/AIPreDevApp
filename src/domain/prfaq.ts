// The epic's PRFAQ and alignment (05-prfaq-alignment, docs/domain.md "PRFAQ agreement").
// Agreement is measured with read-backs, not assumed. `too_close` is decided here, in code
// (docs/ai-teammate.md); the rest of the assessment is a stand-in rule until the model in bolt 6.

import { evaluatePrfaqAgreement, storiesServingNoPromise } from "./checks";
import { nextStoryKey } from "./story-keys";
import type { DomainSnapshot, Epic, FaqEntry, Prfaq, PrfaqPromise, ReadBack, ReadBackAssessment, Story } from "./types";

export type Permission = { ok: true } | { ok: false; reason: string };

// ---------- similarity ----------

export const normaliseText = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function bigrams(t: string): Map<string, number> {
  const s = normaliseText(t);
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice similarity on character bigrams of normalised text, 0 to 1. */
export function similarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  const total = [...x.values()].reduce((n, v) => n + v, 0) + [...y.values()].reduce((n, v) => n + v, 0);
  if (!total) return 0;
  let shared = 0;
  for (const [g, n] of x) shared += Math.min(n, y.get(g) ?? 0);
  return (2 * shared) / total;
}

export const TOO_CLOSE = 0.85;

/** Every sentence a read-back could copy: PRFAQ fields, promises, and FAQ questions and answers. */
export function prfaqSentences(prfaq: Prfaq, ctx: DomainSnapshot): string[] {
  const split = (t: string | null) => (t ?? "").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  return [
    ...[prfaq.headline, prfaq.subhead, prfaq.problem, prfaq.whatChanges, prfaq.successMeasure].flatMap(split),
    ...ctx.promises.filter((p) => p.prfaqId === prfaq.id).map((p) => p.text),
    ...ctx.faqEntries.filter((f) => f.prfaqId === prfaq.id).flatMap((f) => [f.question, ...split(f.answer)]),
  ];
}

export function tooClose(text: string, prfaq: Prfaq, ctx: DomainSnapshot): { tooClose: boolean; score: number; sentence: string | null } {
  let best = { score: 0, sentence: null as string | null };
  for (const s of prfaqSentences(prfaq, ctx)) {
    const score = similarity(text, s);
    if (score > best.score) best = { score, sentence: s };
  }
  return { tooClose: best.score > TOO_CLOSE, ...best };
}

export const TOO_CLOSE_NOTE = "Too close to the page, say it in your own words.";
export const STUB_NOTE = "Assessed by a stand-in rule. The AI teammate assesses read-backs from the next build.";

/**
 * The read-back assessment until bolt 6 swaps in `assessReadBack` (ADR-035): too close to the page
 * is decided in code and always wins; otherwise the stand-in says it matches, and says so.
 */
export function assessReadBackStub(text: string, prfaq: Prfaq, ctx: DomainSnapshot): { assessment: ReadBackAssessment; note: string } {
  return tooClose(text, prfaq, ctx).tooClose ? { assessment: "too_close", note: TOO_CLOSE_NOTE } : { assessment: "matches", note: STUB_NOTE };
}

// ---------- permissions ----------

const name = (ctx: DomainSnapshot, id: string) => ctx.people.find((p) => p.id === id)?.name ?? id;

export function canEditPrfaq(personId: string, epic: Epic, ctx: DomainSnapshot): Permission {
  return personId === epic.ownerId ? { ok: true } : { ok: false, reason: `${name(ctx, epic.ownerId)} owns the PRFAQ` };
}

export function canWriteReadBack(personId: string, epic: Epic): Permission {
  return epic.memberIds.includes(personId) ? { ok: true } : { ok: false, reason: "Read-backs are from the epic's members" };
}

/** Owner or decider, once every read-back matches, no blocking FAQ is open and every promise has a story. */
export function canAgreePrfaq(personId: string, epic: Epic, ctx: DomainSnapshot): { ok: boolean; reasons: string[] } {
  const prfaq = ctx.prfaqs.find((p) => p.epicId === epic.id);
  const reasons: string[] = [];
  if (!prfaq) return { ok: false, reasons: ["The epic has no PRFAQ yet"] };
  if (prfaq.state === "agreed") reasons.push("Already agreed");
  for (const r of evaluatePrfaqAgreement(epic, ctx)) if (!r.passed) reasons.push(...r.blockers.map((b) => b.reason));
  if (personId !== epic.ownerId && personId !== epic.deciderId) {
    reasons.push(`${name(ctx, epic.ownerId)} or ${name(ctx, epic.deciderId)} agrees the PRFAQ`);
  }
  return { ok: reasons.length === 0, reasons };
}

// ---------- edits ----------

/**
 * Any change to the PRFAQ's content: an agreed PRFAQ goes back to draft (it must be agreed again,
 * like edited agreed content on a story, ADR-034), and too-close read-backs are worked out again.
 */
export function afterPrfaqEdit(prfaq: Prfaq, ctx: DomainSnapshot): { prfaq: Prfaq; readBacks: ReadBack[] } {
  const readBacks = ctx.readBacks
    .filter((r) => r.epicId === prfaq.epicId)
    .flatMap((r) => {
      const close = tooClose(r.text, prfaq, ctx).tooClose;
      if (close && r.assessment !== "too_close") return [{ ...r, assessment: "too_close" as const, note: TOO_CLOSE_NOTE }];
      if (!close && r.assessment === "too_close") return [{ ...r, ...assessReadBackStub(r.text, prfaq, ctx) }];
      return [];
    });
  return { prfaq: { ...prfaq, state: "draft" }, readBacks };
}

export type PrfaqFields = Partial<Pick<Prfaq, "headline" | "subhead" | "problem" | "whatChanges" | "successMeasure">>;

export function editPrfaqFields(prfaq: Prfaq, patch: PrfaqFields): Prfaq {
  const next = { ...prfaq };
  for (const [k, v] of Object.entries(patch) as [keyof PrfaqFields, string | null | undefined][]) {
    if (v === undefined) continue;
    const text = (v ?? "").trim();
    if (!text && k !== "successMeasure") throw new Error("The headline, subhead, problem and what changes can't be empty");
    (next[k] as string | null) = text || null;
  }
  return next;
}

/** The quote is real: it can only be an existing verbatim excerpt, never typed. */
export function setCustomerQuote(prfaq: Prfaq, excerptId: string, ctx: DomainSnapshot): Prfaq {
  const excerpt = ctx.excerpts.find((e) => e.id === excerptId);
  if (!excerpt || excerpt.kind !== "quote") throw new Error("Choose a quote from a real source");
  return { ...prfaq, customerQuoteExcerptId: excerpt.id };
}

export function upsertPromise(prfaq: Prfaq, input: { id: string; text: string }, ctx: DomainSnapshot): PrfaqPromise {
  const text = input.text.trim();
  if (!text) throw new Error("A promise needs words");
  const existing = ctx.promises.find((p) => p.id === input.id);
  if (existing && existing.prfaqId !== prfaq.id) throw new Error("That promise belongs to another PRFAQ");
  return { id: input.id, prfaqId: prfaq.id, text };
}

export function upsertFaq(
  prfaq: Prfaq,
  input: { id: string; audience: FaqEntry["audience"]; question: string; answer: string | null; storyIds: string[]; blocking: boolean },
  ctx: DomainSnapshot,
): FaqEntry {
  const question = input.question.trim();
  if (!question) throw new Error("An FAQ entry needs a question");
  const epicStories = new Set(ctx.stories.filter((s) => s.epicId === prfaq.epicId).map((s) => s.id));
  for (const id of input.storyIds) if (!epicStories.has(id)) throw new Error(`${id} isn't a story on this epic`);
  const existing = ctx.faqEntries.find((f) => f.id === input.id);
  if (existing && existing.prfaqId !== prfaq.id) throw new Error("That FAQ belongs to another PRFAQ");
  return {
    id: input.id,
    prfaqId: prfaq.id,
    audience: input.audience,
    question,
    answer: input.answer?.trim() || null,
    storyIds: [...new Set(input.storyIds)],
    // Only internal FAQs block agreement.
    blocking: input.audience === "internal" && input.blocking,
    evidenceExcerptId: existing?.evidenceExcerptId ?? null,
  };
}

/** One line, in the person's own words: what are we building, and why? */
export function writeReadBack(input: { ctx: DomainSnapshot; epic: Epic; personId: string; text: string; now: Date }): ReadBack {
  const { ctx, epic, personId, now } = input;
  const permission = canWriteReadBack(personId, epic);
  if (!permission.ok) throw new Error(permission.reason);
  const prfaq = ctx.prfaqs.find((p) => p.epicId === epic.id);
  if (!prfaq) throw new Error("The epic has no PRFAQ yet");
  const text = input.text.trim().replace(/\s+/g, " ");
  if (text.length < 10) throw new Error("Write a full line: what are we building, and why?");
  if (text.length > 240) throw new Error("Keep it to one line");
  const existing = ctx.readBacks.find((r) => r.epicId === epic.id && r.personId === personId);
  return { id: existing?.id ?? `rb-${epic.id}-${personId}`, epicId: epic.id, personId, text, ...assessReadBackStub(text, prfaq, ctx), createdAt: now };
}

// ---------- the view ----------

export function prfaqView(epic: Epic, ctx: DomainSnapshot, actorId: string) {
  const prfaq = ctx.prfaqs.find((p) => p.epicId === epic.id) ?? null;
  const edit = canEditPrfaq(actorId, epic, ctx);
  const story = (id: string) => ctx.stories.find((s) => s.id === id);
  const storyRef = (id: string) => {
    const s = story(id);
    return s ? { id: s.id, key: s.key, title: s.title, open: s.state !== "ready" && s.state !== "exported" } : null;
  };
  const quote = ctx.excerpts.find((e) => e.id === prfaq?.customerQuoteExcerptId);
  const source = (sourceId: string) => ctx.sources.find((s) => s.id === sourceId);
  const faqs = ctx.faqEntries.filter((f) => f.prfaqId === prfaq?.id);
  const reads = ctx.readBacks.filter((r) => r.epicId === epic.id);
  const mine = reads.find((r) => r.personId === actorId);
  const agree = canAgreePrfaq(actorId, epic, ctx);
  const excerptText = (id: string | null) => ctx.excerpts.find((e) => e.id === id);

  return {
    prfaq,
    state: prfaq?.state ?? null,
    editReason: edit.ok ? null : edit.reason,
    owner: name(ctx, epic.ownerId),
    decider: name(ctx, epic.deciderId),
    quote: quote ? { text: quote.text, source: source(quote.sourceId)?.title ?? "Source", locator: quote.locator } : null,
    quoteOptions: ctx.excerpts
      .filter((e) => e.kind === "quote")
      .map((e) => ({ id: e.id, label: `"${e.text}" · ${source(e.sourceId)?.title ?? ""}, ${e.locator}` })),
    promises: ctx.promises
      .filter((p) => p.prfaqId === prfaq?.id)
      .map((p) => ({ id: p.id, text: p.text, stories: ctx.stories.filter((s) => s.promiseId === p.id && !s.archivedAt).map((s) => storyRef(s.id)!) })),
    faqs: faqs.map((f) => ({
      ...f,
      stories: f.storyIds.map(storyRef).filter((x): x is NonNullable<typeof x> => x !== null),
      evidence: excerptText(f.evidenceExcerptId)?.text ?? null,
    })),
    epicStories: ctx.stories.filter((s) => s.epicId === epic.id && !s.archivedAt).map((s) => ({ id: s.id, key: s.key })),
    readBacks: epic.memberIds.map((id) => {
      const r = reads.find((x) => x.personId === id);
      return {
        personId: id,
        name: name(ctx, id),
        id: r?.id ?? null,
        text: r?.text ?? null,
        assessment: r?.assessment ?? null,
        note: r?.note ?? null,
        /** Diverging or too-close read-backs can go to the next session. */
        talkItThrough: r && (r.assessment === "diverges" || r.assessment === "too_close") ? r.id : null,
      };
    }),
    prompt: canWriteReadBack(actorId, epic).ok ? { existing: mine?.text ?? null } : null,
    unpromised: storiesServingNoPromise(epic, ctx).map((s) => ({
      id: s.id,
      key: s.key,
      title: s.title,
      addReason: edit.ok ? null : edit.reason,
      moveReason: edit.ok ? null : edit.reason,
      dropReason: !edit.ok ? edit.reason : s.state === "draft" || s.state === "triaged" ? null : "Only a story that isn't in refinement yet can be dropped",
    })),
    evidenceAgainst: faqs
      .filter((f) => f.audience === "internal" && f.evidenceExcerptId)
      .map((f) => ({ faqId: f.id, text: excerptText(f.evidenceExcerptId)?.text ?? "", question: f.question, answered: !!f.answer })),
    agree: { enabled: agree.ok, reasons: agree.reasons },
  };
}

export type PrfaqView = ReturnType<typeof prfaqView>;

// ---------- stories that serve no promise (ADR-036) ----------

/** "Drop it": only a story that isn't in refinement yet. Archived, never deleted. */
export function dropStory(story: Story, now: Date): Story {
  if (story.state !== "draft" && story.state !== "triaged") throw new Error("Only a story that isn't in refinement yet can be dropped");
  return { ...story, archivedAt: now };
}

/** "Add a promise": a new promise in the PRFAQ, served by this story. */
export function promiseForStory(story: Story, prfaq: Prfaq, text: string, id: string, ctx: DomainSnapshot): { promise: PrfaqPromise; story: Story } {
  const promise = upsertPromise(prfaq, { id, text }, ctx);
  return { promise, story: { ...story, promiseId: promise.id } };
}

/** "Move to its own epic": a new epic led by whoever moved it, with the story in it. */
export function moveToOwnEpic(story: Story, ctx: DomainSnapshot, actorId: string): { epic: Epic; story: Story } {
  const from = ctx.epics.find((e) => e.id === story.epicId);
  if (!from) throw new Error("The story has no epic");
  const key = nextStoryKey(from, ctx);
  const template = ctx.templates.find((t) => t.name === "big_change") ?? ctx.templates[0];
  const epic: Epic = {
    id: key.toLowerCase(),
    key,
    title: story.title,
    ownerId: actorId,
    deciderId: from.deciderId,
    templateId: template.id,
    memberIds: [...new Set([actorId, story.leadId])],
  };
  return { epic, story: { ...story, epicId: epic.id, promiseId: null } };
}
