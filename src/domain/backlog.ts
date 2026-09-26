// The left column's backlog tree: each row's state, meters and flags, computed (01-workspace).

import { evaluateBuiltRight, evaluatePrfaqAgreement, evaluateRightThing, isLiveItem, storiesServingNoPromise } from "./checks";
import type { DomainSnapshot, Epic, Story, StoryState } from "./types";

export const STATE_LABELS: Record<StoryState, string> = {
  draft: "Draft",
  triaged: "Triaged",
  in_refinement: "In refinement",
  agreed: "Agreed",
  ready: "Ready",
  // Exported stories are Ready ones that are in Jira.
  exported: "Ready",
};

export interface Meter {
  passed: number;
  total: number;
}

export type RowFlag =
  | { kind: "not_in_prfaq"; label: string }
  | { kind: "blocked"; label: string }
  | { kind: "sprint"; label: string };

export interface BacklogRow {
  id: string;
  key: string;
  title: string;
  state: StoryState;
  stateLabel: string;
  ready: boolean;
  rightThing: Meter;
  builtRight: Meter;
  flags: RowFlag[];
}

export interface BacklogEpic {
  id: string;
  key: string;
  title: string;
  /** Read-backs that match, out of epic members. */
  alignment: Meter;
  prfaqAgreed: boolean;
  stories: BacklogRow[];
}

export const meterOf = (results: { passed: boolean }[]): Meter => ({
  passed: results.filter((r) => r.passed).length,
  total: results.length,
});

const byKey = (a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key, "en", { numeric: true });

export function backlogRow(story: Story, ctx: DomainSnapshot, unpromised: Set<string>): BacklogRow {
  const flags: RowFlag[] = [];
  if (unpromised.has(story.id)) flags.push({ kind: "not_in_prfaq", label: "Not in the PRFAQ" });
  const blocking = ctx.items.find(
    (i) => i.parentType === "story" && i.parentId === story.id && i.type === "question" && i.blocking && i.status === "open" && isLiveItem(i),
  );
  if (blocking && story.state !== "draft") flags.push({ kind: "blocked", label: `Blocked · ${blocking.text}` });
  if (story.sprint) flags.push({ kind: "sprint", label: `In ${story.sprint}` });
  return {
    id: story.id,
    key: story.key,
    title: story.title,
    state: story.state,
    stateLabel: STATE_LABELS[story.state],
    ready: story.state === "ready" || story.state === "exported",
    rightThing: meterOf(evaluateRightThing(story, ctx)),
    builtRight: meterOf(evaluateBuiltRight(story, ctx)),
    flags,
  };
}

export function backlogEpic(epic: Epic, ctx: DomainSnapshot): BacklogEpic {
  const unpromised = new Set(storiesServingNoPromise(epic, ctx).map((s) => s.id));
  const readBacks = ctx.readBacks.filter((r) => r.epicId === epic.id);
  const prfaq = ctx.prfaqs.find((p) => p.epicId === epic.id);
  return {
    id: epic.id,
    key: epic.key,
    title: epic.title,
    alignment: {
      passed: epic.memberIds.filter((id) => readBacks.some((r) => r.personId === id && r.assessment === "matches")).length,
      total: epic.memberIds.length,
    },
    prfaqAgreed: prfaq?.state === "agreed" && evaluatePrfaqAgreement(epic, ctx).every((r) => r.passed),
    stories: ctx.stories
      .filter((s) => s.epicId === epic.id)
      .sort(byKey)
      .map((s) => backlogRow(s, ctx, unpromised)),
  };
}

export function backlogTree(ctx: DomainSnapshot): BacklogEpic[] {
  return [...ctx.epics].sort(byKey).map((e) => backlogEpic(e, ctx));
}
