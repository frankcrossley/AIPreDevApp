// 04-checks "Floor checks can't be removed" (domain part; the editor UI is bolt 4).
import { describe, expect, it } from "vitest";
import { FLOOR_CHECK_KEYS, effectiveCheckKeys, updateTeamChecks } from "@/domain/checks";
import { seeded } from "../fixtures";

describe("floor checks can't be removed", () => {
  const storyTemplate = () => seeded().templates.find((t) => t.id === "tpl-story")!;

  it("effective checks always include the floor set, then the template's team checks", () => {
    expect(effectiveCheckKeys(storyTemplate(), "built_right")).toEqual([
      ...FLOOR_CHECK_KEYS.built_right,
      "arch_questions_answered",
      "estimated",
      "mock_if_ui_change",
    ]);
    expect(effectiveCheckKeys(storyTemplate(), "right_thing")).toEqual([...FLOOR_CHECK_KEYS.right_thing, "within_promise_scope"]);
  });

  it("refuses to add a floor key as a team check, so it can never be 'unticked' later", () => {
    expect(() => updateTeamChecks(storyTemplate(), ["estimated", "claims_sourced"])).toThrow(/floor/);
  });

  it("team checks can be added and removed", () => {
    const t = updateTeamChecks(storyTemplate(), ["estimated"]);
    expect(t.teamCheckKeys).toEqual(["estimated"]);
    expect(effectiveCheckKeys(t, "built_right")).toEqual([...FLOOR_CHECK_KEYS.built_right, "estimated"]);
    expect(updateTeamChecks(t, ["estimated", "within_promise_scope"]).teamCheckKeys).toEqual(["estimated", "within_promise_scope"]);
  });

  it("refuses unknown check keys", () => {
    expect(() => updateTeamChecks(storyTemplate(), ["vibes_ok"])).toThrow(/Unknown/);
  });

  it("a template that lists a floor key as a team check still counts it once", () => {
    const t = { ...storyTemplate(), teamCheckKeys: ["claims_sourced", "estimated"] };
    const keys = effectiveCheckKeys(t, "built_right");
    expect(keys.filter((k) => k === "claims_sourced")).toHaveLength(1);
  });
});
