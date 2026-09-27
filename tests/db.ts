// A throwaway Postgres database with the migrations applied and the seed written.
import { randomUUID } from "node:crypto";
import { normaliseSeed } from "@/seed/normalise";
import { createPrisma, type Db } from "@/server/prisma";
import { writeSnapshot } from "../prisma/write-snapshot";
import { NOW, seedJson } from "./fixtures";
import { createFromTemplate, dropDatabase, urlFor } from "./pg";

export interface TestDatabase {
  db: Db;
  /** Connection URL as the owner, for tests that need raw SQL. */
  url: string;
  cleanup: () => Promise<void>;
}

export async function seededDatabase(now: Date = NOW): Promise<TestDatabase> {
  const name = `predev_t_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await createFromTemplate(name);
  const url = urlFor(name);
  const db = createPrisma(url);
  const { snapshot, settings } = normaliseSeed(structuredClone(seedJson), now);
  await writeSnapshot(db, snapshot, settings);
  return {
    db,
    url,
    cleanup: async () => {
      await db.$disconnect();
      await dropDatabase(name);
    },
  };
}

/** The PRFAQ agreed for real in the database, as in the bolt 5 demo. */
export async function agreePrfaqInDb(db: Db) {
  await db.readBack.update({ where: { id: "rb-bill-142-dan" }, data: { assessment: "matches", note: null, text: "Monthly usage billing, with live usage visible so customers can budget." } });
  await db.readBack.upsert({
    where: { id: "rb-bill-142-security" },
    create: { id: "rb-bill-142-security", epicId: "bill-142", personId: "security", text: "Usage pricing that stores no new personal data.", assessment: "matches", createdAt: NOW },
    update: {},
  });
  await db.faqEntry.update({ where: { id: "faq-4" }, data: { answer: "They keep today's fee, capped, for 18 months, then choose." } });
  await db.prfaq.update({ where: { id: "prfaq-142" }, data: { state: "agreed" } });
}
