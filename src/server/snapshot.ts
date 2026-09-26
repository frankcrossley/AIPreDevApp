// Maps between database rows and the domain's DomainSnapshot.
// Reads list fields stored as JSON (ADR-010); prisma/write-snapshot.ts writes them.
import type { Db } from "./prisma";
import type * as D from "@/domain/types";

const list = (json: string): string[] => JSON.parse(json) as string[];

/** Loads everything the domain functions read. Fine at prototype scale. */
export async function loadSnapshot(db: Db): Promise<D.DomainSnapshot> {
  const [
    people, templates, epics, stories, blocks, items, stances, sources, excerpts, citations,
    drafts, hatNotes, criteria, prfaqs, promises, faqEntries, readBacks, sessions,
  ] = await Promise.all([
    db.person.findMany({ orderBy: { id: "asc" } }),
    db.template.findMany({ orderBy: { id: "asc" } }),
    db.epic.findMany({ orderBy: { key: "asc" } }),
    db.story.findMany({ orderBy: { key: "asc" } }),
    db.block.findMany({ orderBy: [{ parentId: "asc" }, { section: "asc" }, { order: "asc" }] }),
    db.item.findMany({ orderBy: { id: "asc" } }),
    db.stance.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    db.source.findMany({ orderBy: { id: "asc" } }),
    db.excerpt.findMany({ orderBy: { id: "asc" } }),
    db.citation.findMany({ orderBy: { id: "asc" } }),
    db.draft.findMany({ orderBy: { id: "asc" } }),
    db.hatNote.findMany({ orderBy: { id: "asc" } }),
    db.criterion.findMany({ orderBy: { id: "asc" } }),
    db.prfaq.findMany({ orderBy: { id: "asc" } }),
    db.prfaqPromise.findMany({ orderBy: { id: "asc" } }),
    db.faqEntry.findMany({ orderBy: { id: "asc" } }),
    db.readBack.findMany({ orderBy: { id: "asc" } }),
    db.session.findMany({ orderBy: { date: "asc" } }),
  ]);

  return {
    people: people.map((p) => ({ ...p, role: p.role as D.Role })),
    templates: templates.map(({ sectionsJson, requiredSectionsJson, teamCheckKeysJson, ...t }) => ({
      ...t,
      sections: list(sectionsJson),
      requiredSections: list(requiredSectionsJson),
      teamCheckKeys: list(teamCheckKeysJson),
    })),
    epics: epics.map(({ memberIdsJson, ...e }) => ({ ...e, memberIds: list(memberIdsJson) })),
    stories: stories.map((s) => ({ ...s, state: s.state as D.StoryState })),
    blocks: blocks.map((b) => ({ ...b, parentType: b.parentType as D.ParentType })),
    items: items.map(({ requiredStanceIdsJson, ...i }) => ({
      ...i,
      parentType: i.parentType as D.ParentType,
      status: i.status as D.ItemStatus,
      requiredStanceIds: list(requiredStanceIdsJson),
    })),
    stances: stances.map((s) => ({ ...s, value: s.value as D.StanceValue })),
    sources: sources.map((s) => ({ ...s, kind: s.kind as D.SourceKind })),
    excerpts: excerpts.map((e) => ({ ...e, kind: e.kind as D.Excerpt["kind"] })),
    citations: citations.map((c) => ({ ...c, fromType: c.fromType as D.CitationFrom, toType: c.toType as D.CitationTo })),
    drafts: drafts.map((d) => ({
      ...d,
      targetType: d.targetType as D.ParentType | null,
      status: d.status as D.DraftStatus,
    })),
    hatNotes: hatNotes.map(({ refsJson, ...h }) => ({
      ...h,
      hat: h.hat as D.Hat,
      targetType: h.targetType as D.HatNote["targetType"],
      kind: h.kind as D.HatNoteKind,
      status: h.status as D.HatNote["status"],
      refs: list(refsJson),
    })),
    criteria: criteria.map((c) => ({ ...c, origin: c.origin as D.Criterion["origin"] })),
    prfaqs: prfaqs.map((p) => ({ ...p, state: p.state as D.Prfaq["state"] })),
    promises,
    faqEntries: faqEntries.map(({ storyIdsJson, ...f }) => ({
      ...f,
      audience: f.audience as D.FaqEntry["audience"],
      storyIds: list(storyIdsJson),
    })),
    readBacks: readBacks.map((r) => ({ ...r, assessment: r.assessment as D.ReadBackAssessment })),
    sessions: sessions.map(({ attendeeIdsJson, agendaJson, ...s }) => ({
      ...s,
      status: s.status as D.Session["status"],
      attendeeIds: list(attendeeIdsJson),
      agenda: list(agendaJson),
    })),
  };
}
