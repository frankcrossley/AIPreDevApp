// Plain-text check report for a story. Used by `npm run checks` and printed by the seed tests.

import { evaluateBuiltRight, evaluateRightThing } from "./checks";
import type { CheckResult, DomainSnapshot, Story } from "./types";

export const meterText = (results: CheckResult[]) => `${results.filter((r) => r.passed).length} of ${results.length}`;

export function formatStoryReport(story: Story, ctx: DomainSnapshot): string {
  const section = (title: string, results: CheckResult[]) => [
    `  ${title}: ${meterText(results)}`,
    ...results.map((r) => `    ${r.passed ? "pass" : "FAIL"}  ${r.key} (${r.tier})  ${r.reason}`),
  ];
  return [
    `${story.key} · ${story.title}`,
    ...section("Right thing", evaluateRightThing(story, ctx)),
    ...section("Built right", evaluateBuiltRight(story, ctx)),
  ].join("\n");
}
