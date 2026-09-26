// Every failing line links to its fix: fixTargets map to notebook elements.
import { describe, expect, it } from "vitest";
import { anchorFor } from "@/domain/anchors";
import { seeded } from "../fixtures";

describe("anchorFor", () => {
  const ctx = seeded();
  it.each([
    [{ type: "item", id: "it-q1" }, "block-b6"],
    [{ type: "block", id: "b7" }, "block-b7"],
    [{ type: "hatNote", id: "hn3" }, "block-b4"],
    [{ type: "hatNote", id: "hn4" }, "block-b6"],
    [{ type: "criterion", id: "ac1" }, "criterion-ac1"],
    [{ type: "prfaq", id: "prfaq-142" }, null],
    [null, null],
  ] as const)("%j → %s", (target, anchor) => {
    expect(anchorFor(target, ctx)).toBe(anchor);
  });
});
