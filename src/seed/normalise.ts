// Turns seed/seed.json into a DomainSnapshot, resolving relative dates against `now`.
// Pure: the caller reads the file. The seeder writes the result to the database, and the
// domain tests use it directly, so both see exactly the same data.

import { draftExpiresAt, draftExpiryDays, addDays } from "@/domain/drafts";
import type {
  Block,
  Citation,
  CitationFrom,
  Criterion,
  DomainSnapshot,
  Draft,
  Excerpt,
  FaqEntry,
  HatNote,
  Item,
  ParentType,
  PrfaqPromise,
  Prfaq,
  ReadBack,
  Session,
  Source,
  Stance,
  Story,
  Template,
} from "@/domain/types";

/* eslint-disable @typescript-eslint/no-explicit-any -- seed.json is untyped input, checked field by field below */
export type SeedFile = Record<string, any>;

export interface NormalisedSeed {
  snapshot: DomainSnapshot;
  /** Settings kept as-is, e.g. the simulated Jira config (ADR-004). */
  settings: Record<string, unknown>;
}

const MINUTE_MS = 60 * 1000;

export function normaliseSeed(seed: SeedFile, now: Date): NormalisedSeed {
  const daysAgo = (n: number | undefined) => (n === undefined ? null : addDays(now, -n));

  const people = seed.people.map((p: any) => ({ id: p.id, name: p.name, role: p.role }));

  const templates: Template[] = seed.templates.map((t: any) => ({
    id: t.id,
    name: t.name,
    sections: t.sections,
    requiredSections: t.requiredSections ?? t.sections,
    teamCheckKeys: t.teamCheckKeys ?? [],
    requiresPrfaq: Boolean(t.requiresPrfaq),
    draftExpiryDays: t.draftExpiryDays,
    silenceRule: t.silenceRule,
    disagreementRule: t.disagreementRule,
  }));

  const epics = seed.epics.map((e: any) => ({
    id: e.id,
    key: e.key,
    title: e.title,
    ownerId: e.ownerId,
    deciderId: e.deciderId,
    templateId: e.templateId,
    memberIds: e.memberIds,
  }));
  const epicIds = new Set<string>(epics.map((e: any) => e.id));

  const stories: Story[] = seed.stories.map((s: any) => ({
    id: s.id,
    key: s.key,
    epicId: s.epicId,
    title: s.title,
    leadId: s.leadId,
    templateId: s.templateId,
    state: s.state,
    promiseId: s.promiseId ?? null,
    estimate: s.estimate ?? null,
    hasUiChange: Boolean(s.hasUiChange),
    mockUri: s.mockUri ?? null,
    jiraKey: s.jiraKey ?? null,
    sprint: s.sprint ?? null,
    signedOffBy: s.signedOffBy ?? null,
    signedOffAt: s.signedOffBy ? daysAgo(s.signedOffDaysAgo ?? 0) : null,
  }));

  const parentTypeOf = (id: string): ParentType => (epicIds.has(id) ? "epic" : "story");

  const prfaqs: Prfaq[] = [];
  const promises: PrfaqPromise[] = [];
  const faqEntries: FaqEntry[] = [];
  for (const p of seed.prfaqs ?? []) {
    prfaqs.push({
      id: p.id,
      epicId: p.epicId,
      headline: p.headline,
      subhead: p.subhead,
      problem: p.problem,
      whatChanges: p.whatChanges,
      customerQuoteExcerptId: p.customerQuoteExcerptId ?? null,
      successMeasure: p.successMeasure ?? null,
      state: p.state,
    });
    for (const pr of p.promises ?? []) promises.push({ id: pr.id, prfaqId: p.id, text: pr.text });
    for (const f of p.faq ?? []) {
      faqEntries.push({
        id: f.id,
        prfaqId: p.id,
        audience: f.audience,
        question: f.question,
        answer: f.answer ?? null,
        storyIds: f.storyIds ?? [],
        blocking: Boolean(f.blocking),
      });
    }
  }

  // Read-backs in the seed don't name their epic. That's only unambiguous with one epic.
  const soleEpicId = (): string => {
    if (epics.length !== 1) throw new Error("readBacks without epicId need exactly one epic in the seed");
    return epics[0].id;
  };
  const readBacks: ReadBack[] = (seed.readBacks ?? []).map((r: any) => {
    const epicId = r.epicId ?? soleEpicId();
    return {
      id: r.id ?? `rb-${epicId}-${r.personId}`,
      epicId,
      personId: r.personId,
      text: r.text,
      assessment: r.assessment ?? "pending",
      note: r.note ?? null,
      createdAt: daysAgo(r.daysAgo ?? 0)!,
    };
  });

  const sources: Source[] = seed.sources.map((s: any) => ({
    id: s.id,
    kind: s.kind,
    title: s.title,
    date: daysAgo(s.daysAgo),
    uri: s.file ?? null,
  }));

  const excerpts: Excerpt[] = seed.excerpts.map((e: any) => ({
    id: e.id,
    sourceId: e.sourceId,
    text: e.text,
    locator: e.locator,
    kind: e.kind ?? "quote",
    note: e.note ?? null,
  }));
  const excerptIds = new Set(excerpts.map((e) => e.id));
  const blockIds = new Set<string>(seed.blocks.map((b: any) => b.id));

  const citations: Citation[] = [];
  const cite = (fromType: CitationFrom, fromId: string, refs: string[] | undefined) => {
    for (const toId of refs ?? []) {
      const toType = excerptIds.has(toId) ? "excerpt" : blockIds.has(toId) ? "block" : null;
      if (!toType) throw new Error(`${fromType} ${fromId} cites unknown id ${toId}`);
      citations.push({ id: `cit-${fromType}-${fromId}-${toId}`, fromType, fromId, toType, toId });
    }
  };

  const blocks: Block[] = seed.blocks.map((b: any) => {
    cite("block", b.id, b.citations);
    return {
      id: b.id,
      parentType: b.parentType ?? parentTypeOf(b.parentId),
      parentId: b.parentId,
      section: b.section,
      order: b.order,
      text: b.text,
      authorId: b.authorId,
      createdAt: daysAgo(b.daysAgo ?? 0)!,
      updatedAt: daysAgo(b.daysAgo ?? 0)!,
    };
  });

  const items: Item[] = seed.items.map((i: any) => {
    cite("item", i.id, i.citations);
    return {
      id: i.id,
      parentType: i.parentType ?? parentTypeOf(i.parentId),
      parentId: i.parentId,
      blockId: i.blockId ?? null,
      type: i.type,
      text: i.text,
      status: i.status ?? "open",
      ownerId: i.ownerId ?? null,
      blocking: Boolean(i.blocking),
      requiredStanceIds: i.requiredStanceIds ?? [],
      stanceRound: i.stanceRound ?? 1,
    };
  });

  // Seeded stances have no timestamps. Keep their order by spacing them a minute apart.
  const stances: Stance[] = (seed.stances ?? []).map((s: any, index: number, all: any[]) => ({
    id: s.id ?? `st-${s.itemId}-${s.personId}-${index + 1}`,
    itemId: s.itemId,
    personId: s.personId,
    value: s.value,
    reason: s.reason ?? null,
    round: s.round ?? 1,
    createdAt: new Date(now.getTime() - (all.length - index) * MINUTE_MS),
  }));

  const criteria: Criterion[] = (seed.criteria ?? []).map((c: any) => {
    cite("criterion", c.id, c.citations);
    return {
      id: c.id,
      storyId: c.storyId,
      given: c.given,
      when: c.when,
      then: c.then,
      origin: c.origin,
      hat: c.hat ?? null,
      confirmedBy: c.confirmedBy ?? null,
    };
  });

  const itemIds = new Set(items.map((i) => i.id));
  const criterionIds = new Set(criteria.map((c) => c.id));
  const storyIds = new Set(stories.map((s) => s.id));
  const draftIds = new Set<string>((seed.drafts ?? []).map((d: any) => d.id));
  const hatTargetType = (id: string): HatNote["targetType"] => {
    if (blockIds.has(id)) return "block";
    if (itemIds.has(id)) return "item";
    if (criterionIds.has(id)) return "criterion";
    if (storyIds.has(id)) return "story";
    if (epicIds.has(id)) return "epic";
    if (draftIds.has(id)) return "draft";
    throw new Error(`Hat note targets unknown id ${id}`);
  };
  const hatNotes: HatNote[] = (seed.hatNotes ?? []).map((h: any) => ({
    id: h.id,
    hat: h.hat,
    targetType: h.targetType ?? hatTargetType(h.targetId),
    targetId: h.targetId,
    kind: h.kind,
    text: h.text,
    refs: h.refs ?? [],
    status: h.status ?? "open",
    moveToId: h.moveToId ?? null,
  }));

  const sessions: Session[] = (seed.sessions ?? []).map((s: any) => ({
    id: s.id,
    date: addDays(now, s.inDays ?? 0),
    lengthMinutes: s.lengthMinutes ?? 60,
    attendeeIds: s.attendeeIds ?? [],
    agenda: s.agenda ?? [],
    status: s.status ?? "planned",
    captureText: s.captureText ?? "",
  }));

  const drafts: Draft[] = (seed.drafts ?? []).map((d: any) => {
    const targetType = d.targetId ? parentTypeOf(d.targetId) : null;
    const createdAt = daysAgo(d.createdDaysAgo ?? 0)!;
    const target = { targetType, targetId: d.targetId ?? null };
    const expiresAt = draftExpiresAt(
      createdAt,
      draftExpiryDays(target, { stories, epics, templates }),
      sessions,
    );
    return {
      id: d.id,
      ...target,
      text: d.text,
      authorId: d.authorId ?? null,
      excerptId: d.excerptId ?? null,
      sourceId: d.sourceId ?? null,
      createdAt,
      expiresAt,
      status: d.status ?? "pending",
      triagedBy: d.triagedBy ?? null,
      triagedAt: d.triagedBy ? createdAt : null,
      resultBlockId: d.acceptedAsBlockId ?? null,
      kind: d.kind ?? "note",
      section: d.section ?? null,
      op: d.op ?? null,
      blockId: d.blockId ?? null,
      afterBlockId: d.afterBlockId ?? null,
      itemType: d.itemType ?? null,
      hatNoteId: d.hatNoteId ?? null,
    };
  });

  return {
    snapshot: {
      people,
      templates,
      epics,
      stories,
      blocks,
      items,
      stances,
      sources,
      excerpts,
      citations,
      drafts,
      hatNotes,
      criteria,
      prfaqs,
      promises,
      faqEntries,
      readBacks,
      sessions,
    },
    settings: {
      ...(seed.team ? { team: seed.team } : {}),
      ...(seed.jira ? { jira: seed.jira } : {}),
    },
  };
}
