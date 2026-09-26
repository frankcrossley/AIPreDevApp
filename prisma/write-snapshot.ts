// Writes a whole DomainSnapshot into an empty database. Used only by the seeder (and its test).
// Lives outside src/ on purpose: nothing in the app creates or rewrites stories wholesale.
import type { Db } from "../src/server/prisma";
import type * as D from "../src/domain/types";

const json = (value: unknown): string => JSON.stringify(value);

/** Writes a whole snapshot into an empty database. Used by the seeder. */
export async function writeSnapshot(db: Db, s: D.DomainSnapshot, settings: Record<string, unknown> = {}): Promise<void> {
  await db.$transaction([
    db.person.createMany({ data: s.people }),
    db.template.createMany({
      data: s.templates.map(({ sections, requiredSections, teamCheckKeys, ...t }) => ({
        ...t,
        sectionsJson: json(sections),
        requiredSectionsJson: json(requiredSections),
        teamCheckKeysJson: json(teamCheckKeys),
      })),
    }),
    db.epic.createMany({ data: s.epics.map(({ memberIds, ...e }) => ({ ...e, memberIdsJson: json(memberIds) })) }),
    db.story.createMany({ data: s.stories }),
    db.block.createMany({ data: s.blocks }),
    db.item.createMany({
      data: s.items.map(({ requiredStanceIds, ...i }) => ({ ...i, requiredStanceIdsJson: json(requiredStanceIds) })),
    }),
    db.stance.createMany({ data: s.stances }),
    db.source.createMany({ data: s.sources }),
    db.excerpt.createMany({ data: s.excerpts }),
    db.citation.createMany({ data: s.citations }),
    db.draft.createMany({ data: s.drafts }),
    db.hatNote.createMany({ data: s.hatNotes.map(({ refs, ...h }) => ({ ...h, refsJson: json(refs) })) }),
    db.criterion.createMany({ data: s.criteria }),
    db.prfaq.createMany({ data: s.prfaqs }),
    db.prfaqPromise.createMany({ data: s.promises }),
    db.faqEntry.createMany({ data: s.faqEntries.map(({ storyIds, ...f }) => ({ ...f, storyIdsJson: json(storyIds) })) }),
    db.readBack.createMany({ data: s.readBacks }),
    db.session.createMany({
      data: s.sessions.map(({ attendeeIds, agenda, ...x }) => ({
        ...x,
        attendeeIdsJson: json(attendeeIds),
        agendaJson: json(agenda),
      })),
    }),
    db.setting.createMany({ data: Object.entries(settings).map(([key, value]) => ({ key, valueJson: json(value) })) }),
  ]);
}
