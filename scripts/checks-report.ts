// Prints every seeded story's checks, computed straight from seed/seed.json.
import { readFileSync } from "node:fs";
import { formatStoryReport } from "../src/domain/report";
import { normaliseSeed } from "../src/seed/normalise";

const seed = JSON.parse(readFileSync(new URL("../seed/seed.json", import.meta.url), "utf8"));
const { snapshot } = normaliseSeed(seed, new Date());
for (const story of snapshot.stories) console.log(`${formatStoryReport(story, snapshot)}\n`);
