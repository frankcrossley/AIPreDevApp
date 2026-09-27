// 04-checks "There is no way to force Ready", enforced on the code itself.
// Only src/server/lifecycle.ts may write a story's state or sign-off, and it only does so
// through the domain's signOff/transition/reopenOnEdit. The seeder in prisma/ is the one
// other writer, and it only loads seed.json (ADR-013). The API test on the sign-off route is
// in tests/e2e/checks.spec.ts.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve("src");
const SCANNED = [SRC, path.resolve("scripts")];
const ALLOWED_WRITER = path.join(SRC, "server", "lifecycle.ts");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (full === path.join(SRC, "generated")) return [];
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

// Any write through the story delegate (including across lines), raw SQL, aliasing the delegate,
// or opening SQLite directly.
const STORY_WRITE = new RegExp(
  [
    String.raw`\.story\s*\.\s*(update|upsert|create|delete)\w*\s*\(`,
    String.raw`\$(executeRaw|queryRaw)\w*`,
    String.raw`=\s*\w+\s*\.\s*story\s*[;,)\n]`,
    String.raw`from\s+["']better-sqlite3["']`,
  ].join("|"),
);

describe("there is no way to force Ready (code guard)", () => {
  it("the guard catches the ways around it", () => {
    for (const bad of [
      "db.story.update({",
      "db.story\n  .updateManyAndReturn(",
      "db.story.createManyAndReturn(",
      "await db.$queryRawUnsafe('UPDATE Story')",
      "const s = db.story;",
      'import Database from "better-sqlite3";',
    ]) {
      expect(STORY_WRITE.test(bad), bad).toBe(true);
    }
    expect(STORY_WRITE.test("db.story.findMany({")).toBe(false);
  });

  it("nothing in src/ or scripts/ but the lifecycle module writes Story rows", () => {
    const offenders = SCANNED.flatMap(files).filter((f) => f !== ALLOWED_WRITER && STORY_WRITE.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it("the lifecycle module only writes state it got back from the domain's guarded functions", () => {
    const src = readFileSync(ALLOWED_WRITER, "utf8");
    expect(src).toMatch(/signOff\(story/);
    const writes = [...src.matchAll(/\b(state|signedOffBy|signedOffAt):\s*([^,}\n]+)/g)].map((m) => `${m[1]}: ${m[2].trim()}`);
    expect(writes.length).toBeGreaterThan(0);
    // The only literal state allowed is "draft", for a newly created story.
    for (const w of writes) expect(w).toMatch(/^((state|signedOffBy|signedOffAt): r\.story\.(state|signedOffBy|signedOffAt)|state: "draft")$/);
  });

  it("no route handler or server action writes a story directly", () => {
    const routes = files(SRC).filter((f) => /[/\\]route\.tsx?$/.test(f) || /["']use server["']/.test(readFileSync(f, "utf8")));
    for (const f of routes) expect(readFileSync(f, "utf8"), f).not.toMatch(STORY_WRITE);
  });
});

describe("routes and server actions", () => {
  const entryPoints = () => files(SRC).filter((f) => /[/\\]route\.tsx?$/.test(f) || /^["']use server["']/m.test(readFileSync(f, "utf8")));

  it("every route or server action that signs off or moves a story goes through the lifecycle", () => {
    const touching = entryPoints().filter((f) => /signOff|transitionStory|\bstate\b/.test(readFileSync(f, "utf8")));
    expect(touching.map((f) => path.relative(SRC, f)).sort()).toEqual([
      path.join("app", "actions.ts"),
      path.join("app", "api", "stories", "[key]", "sign-off", "route.ts"),
    ]);
    for (const f of touching) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/from "@\/server\/lifecycle"/);
      expect(src, f).toMatch(/signOffStory\(/);
      expect(src, f).not.toMatch(/state:\s*["']ready["']/);
      expect(src, f).not.toMatch(/["']ready["']/);
    }
  });
});
