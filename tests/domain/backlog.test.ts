// 01-workspace "Backlog rows show state at a glance".
import { describe, expect, it } from "vitest";
import { backlogTree } from "@/domain/backlog";
import { nextStoryKey } from "@/domain/story-keys";
import { seeded } from "../fixtures";

describe("backlog rows", () => {
  const [epic] = backlogTree(seeded());
  const row = (key: string) => epic.stories.find((s) => s.key === key)!;

  it("the epic shows alignment 4 of 6", () => {
    expect(epic).toMatchObject({ key: "BILL-142", alignment: { passed: 4, total: 6 } });
  });

  it("every story row has its state and both counts, in key order", () => {
    expect(epic.stories.map((s) => [s.key, s.stateLabel, `${s.rightThing.passed}/${s.rightThing.total}`, `${s.builtRight.passed}/${s.builtRight.total}`])).toEqual([
      ["BILL-150", "In refinement", "4/5", "5/8"],
      ["BILL-151", "In refinement", "3/5", "5/8"],
      ["BILL-152", "Ready", "3/5", "7/8"],
      ["BILL-160", "Draft", "3/5", "5/8"],
      ["BILL-163", "Triaged", "2/5", "5/8"],
    ]);
  });

  it("BILL-163 is marked Not in the PRFAQ", () => {
    expect(row("BILL-163").flags).toContainEqual({ kind: "not_in_prfaq", label: "Not in the PRFAQ" });
    expect(row("BILL-150").flags.map((f) => f.kind)).not.toContain("not_in_prfaq");
  });

  it("BILL-152 is marked Ready, with its sprint", () => {
    expect(row("BILL-152")).toMatchObject({ stateLabel: "Ready", ready: true });
    expect(row("BILL-152").flags).toContainEqual({ kind: "sprint", label: "In Sprint 41" });
  });

  it("BILL-151 is flagged as blocked on the cap question", () => {
    expect(row("BILL-151").flags).toContainEqual({ kind: "blocked", label: "Blocked · How long does the fee cap last?" });
  });
});

describe("nextStoryKey", () => {
  it("continues after the highest key with the epic's prefix", () => {
    const ctx = seeded();
    expect(nextStoryKey(ctx.epics[0], ctx)).toBe("BILL-164");
  });
});
