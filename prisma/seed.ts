// Loads seed/seed.json into the database, resolving relative dates against now.
// Run by `npm run db:reset` (scripts/db-reset.ts) once migrations are applied.
import { readFileSync } from "node:fs";
import { normaliseSeed } from "../src/seed/normalise";
import { createPrisma } from "../src/server/prisma";
import { writeSnapshot } from "./write-snapshot";

async function main() {
  const seed = JSON.parse(readFileSync(new URL("../seed/seed.json", import.meta.url), "utf8"));
  const { snapshot, settings } = normaliseSeed(seed, new Date());
  const db = createPrisma();
  try {
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
