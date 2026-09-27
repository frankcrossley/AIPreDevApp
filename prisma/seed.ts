// Loads seed/seed.json into the database, resolving relative dates against now.
// Run by `npm run db:reset` (scripts/db-reset.ts) once migrations are applied, or once by an
// operator as `npm run db:seed` to load a new deployment (docs/deploy.md).
// It only ever seeds an empty database, and a remote one only when SEED_CONFIRM names its host.
import { readFileSync } from "node:fs";
import { normaliseSeed } from "../src/seed/normalise";
import { databaseUrl, isLocalHost } from "../src/server/database-config";
import { createPrisma } from "../src/server/prisma";
import { writeSnapshot } from "./write-snapshot";

async function main() {
  const seed = JSON.parse(readFileSync(new URL("../seed/seed.json", import.meta.url), "utf8"));
  const { snapshot, settings } = normaliseSeed(seed, new Date());
  const host = new URL(databaseUrl()).hostname;
  if (!isLocalHost(host) && process.env.SEED_CONFIRM !== host) {
    throw new Error(`Refusing to seed ${host}: set SEED_CONFIRM=${host} to confirm this is the database you mean.`);
  }
  const db = createPrisma();
  try {
    if ((await db.person.count()) > 0) throw new Error(`Refusing to seed ${host}: it already has data. Seeding never overwrites.`);
    await writeSnapshot(db, snapshot, settings);
    console.log(`Seeded ${snapshot.stories.length} stories, ${snapshot.blocks.length} blocks, ${snapshot.drafts.length} drafts.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
