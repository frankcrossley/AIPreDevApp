// 04-checks: the checks view, its links and the sign-off button.
import { describe, expect, it } from "vitest";
import { canChangeTeamChecks, canEditTemplate, checksView, readyDrift, shortSubject } from "@/domain/checks-view";
import { NOW, makeBill150Pass, seeded, story } from "../fixtures";

describe("shortSubject", () => {
  it.each([
    ["What happens on a downgrade mid-cycle?", "downgrade mid-cycle"],
    ["How long does the fee cap last?", "fee cap last"],
    ["Do we move to Stripe Tax?", "Stripe Tax"],
    ["Downgrade then upgrade in the same cycle: which rule wins?", "Downgrade then upgrade in"],
  ])("%s → %s", (text, subject) => {
    expect(shortSubject(text)).toBe(subject);
  });
});

describe("checksView for BILL-150", () => {
  const ctx = seeded();
  const v = checksView(story(ctx, "BILL-150"), ctx, "priya", NOW);

  it("shows 4 of 5 and 5 of 8, failing team_aligned", () => {
    expect([v.rightThing.passed, v.rightThing.total, v.builtRight.passed, v.builtRight.total]).toEqual([4, 5, 5, 8]);
    expect(v.rightThing.lines.filter((l) => !l.passed).map((l) => l.key)).toEqual(["team_aligned"]);
  });

  it("every failing line has a short subject and a link to its fix", () => {
    const line = (key: string) => [...v.rightThing.lines, ...v.builtRight.lines].find((l) => l.key === key)!;
    expect(line("no_blocking_questions")).toMatchObject({ label: "No blocking questions", detail: "downgrade mid-cycle", tier: "floor", link: { kind: "anchor", anchor: "block-b6" } });
    expect(line("stances_complete")).toMatchObject({ detail: "Dan", link: { kind: "anchor", anchor: "block-b4" } });
    expect(line("arch_questions_answered")).toMatchObject({ tier: "team", link: { kind: "anchor", anchor: "block-b4" } });
    expect(line("team_aligned")).toMatchObject({ detail: "read-backs 4 of 6, Dan diverges", link: { kind: "href", href: "/w/BILL-142" } });
    for (const l of [...v.rightThing.lines, ...v.builtRight.lines]) {
      if (!l.passed) expect(l.link, l.key).not.toBeNull();
      else expect(l.link, l.key).toBeNull();
    }
  });

  it("sign-off is disabled while checks fail, with reasons", () => {
    expect(v.signOff).toEqual({ enabled: false, reasons: ["4 checks still fail"], lead: "Priya" });
  });
});

describe("Ready needs both checks and the lead", () => {
  it("enabled only for Priya once everything passes", () => {
    const ctx = makeBill150Pass(seeded());
    expect(checksView(story(ctx, "BILL-150"), ctx, "priya", NOW).signOff).toEqual({ enabled: true, reasons: [], lead: "Priya" });
    for (const who of ["sam", "dan", "hop", "mei", "marcus", "jo"]) {
      expect(checksView(story(ctx, "BILL-150"), ctx, who, NOW).signOff, who).toEqual({ enabled: false, reasons: ["Priya is the lead"], lead: "Priya" });
    }
  });
});

describe("drift on Ready stories", () => {
  it("BILL-152 was signed off, but its checks fail now", () => {
    const ctx = seeded();
    expect(readyDrift(story(ctx, "BILL-152"), ctx)).toEqual(["Backed by evidence", "Team aligned on the PRFAQ", "Criteria traced"]);
    expect(readyDrift(story(ctx, "BILL-150"), ctx)).toEqual([]);
  });
});

describe("who edits template checks", () => {
  it("product, tech lead and head of product", () => {
    const people = seeded().people;
    const by = (id: string) => people.find((p) => p.id === id);
    expect(["priya", "dan", "hop"].map((id) => canEditTemplate(by(id)))).toEqual([true, true, true]);
    expect(["sam", "marcus", "jo"].map((id) => canEditTemplate(by(id)))).toEqual([false, false, false]);
  });
});

describe("changing team checks", () => {
  const people = seeded().people;
  const by = (id: string) => people.find((p) => p.id === id);
  const all = ["within_promise_scope", "arch_questions_answered", "estimated", "mock_if_ui_change"];

  it("a lead can add a check but not remove one to get their own story through", () => {
    expect(canChangeTeamChecks(by("priya"), ["estimated"], ["estimated", "mock_if_ui_change"])).toEqual({ ok: true });
    expect(canChangeTeamChecks(by("priya"), all, all.filter((k) => k !== "arch_questions_answered"))).toEqual({
      ok: false,
      reason: "Removing a team check needs the tech lead or the head of product",
    });
  });

  it("the tech lead and the head of product can remove; others can't change anything", () => {
    expect(canChangeTeamChecks(by("dan"), all, ["estimated"])).toEqual({ ok: true });
    expect(canChangeTeamChecks(by("hop"), all, [])).toEqual({ ok: true });
    expect(canChangeTeamChecks(by("sam"), [], ["estimated"])).toMatchObject({ ok: false });
  });
});
