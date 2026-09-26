// seed._expected in seed/seed.json, reproduced exactly. Also: 04-checks "Meters reflect computed results".
import { describe, expect, it } from "vitest";
import { evaluateBuiltRight, evaluatePrfaqAgreement, evaluateRightThing, storiesServingNoPromise } from "@/domain/checks";
import { daysUntilExpiry, isExpired } from "@/domain/drafts";
import { formatStoryReport } from "@/domain/report";
import { NOW, seeded, seedJson, story } from "../fixtures";

const failing = (results: { key: string; passed: boolean }[]) => results.filter((r) => !r.passed).map((r) => r.key);
const meter = (results: { passed: boolean }[]) => `${results.filter((r) => r.passed).length} of ${results.length}`;

describe("seed._expected", () => {
  it("has the expectations this file checks", () => {
    expect(seedJson._expected["BILL-150"]).toEqual({
      rightThing: "4 of 5, failing team_aligned",
      builtRight: "5 of 8, failing no_blocking_questions, stances_complete (Dan), arch_questions_answered",
    });
    expect(seedJson._expected["BILL-142"]).toEqual({
      prfaqAgreement:
        "blocked: Dan's read-back diverges, Security has none, faq-4 unanswered; BILL-163 serves no promise (flagged, not blocking)",
    });
    expect(seedJson._expected.drafts).toBe(
      "With a session in 5 days: dr1 and dr3 expire in 5 days, dr2 in 2, dr4 tomorrow, dr5 in 3; dr6 is already expired.",
    );
  });

  it("BILL-150 Right thing: 4 of 5, failing team_aligned", () => {
    const ctx = seeded();
    const results = evaluateRightThing(story(ctx, "BILL-150"), ctx);
    console.log(formatStoryReport(story(ctx, "BILL-150"), ctx));
    expect(meter(results)).toBe("4 of 5");
    expect(failing(results)).toEqual(["team_aligned"]);
    expect(results.map((r) => r.key)).toEqual([
      "serves_promise",
      "evidence_backed",
      "success_measure_linked",
      "team_aligned",
      "within_promise_scope",
    ]);
  });

  it("BILL-150 Built right: 5 of 8, failing no_blocking_questions, stances_complete (Dan), arch_questions_answered", () => {
    const ctx = seeded();
    const results = evaluateBuiltRight(story(ctx, "BILL-150"), ctx);
    expect(meter(results)).toBe("5 of 8");
    expect(failing(results)).toEqual(["no_blocking_questions", "stances_complete", "arch_questions_answered"]);

    const stances = results.find((r) => r.key === "stances_complete")!;
    expect(stances.blockers.map((b) => b.personId)).toEqual(["dan"]);
    expect(stances.reason).toContain("Dan");

    const questions = results.find((r) => r.key === "no_blocking_questions")!;
    expect(questions.reason).toContain("What happens on a downgrade mid-cycle?");
  });

  it("BILL-142 PRFAQ agreement is blocked by Dan's read-back, Security's missing read-back and faq-4", () => {
    const ctx = seeded();
    const epic = ctx.epics.find((e) => e.key === "BILL-142")!;
    const results = evaluatePrfaqAgreement(epic, ctx);
    const blockers = results.filter((r) => !r.passed).flatMap((r) => r.blockers.map((b) => b.fixTarget));

    expect(failing(results)).toEqual(["readbacks_complete", "readbacks_match", "blocking_faq_answered"]);
    expect(blockers).toEqual([
      { type: "person", id: "security" },
      { type: "readBack", id: "rb-bill-142-dan" },
      { type: "faq", id: "faq-4" },
    ]);
    expect(results.find((r) => r.key === "promises_served")!.passed).toBe(true);
  });

  it("BILL-163 serves no promise: flagged, not blocking", () => {
    const ctx = seeded();
    const epic = ctx.epics.find((e) => e.key === "BILL-142")!;
    expect(storiesServingNoPromise(epic, ctx).map((s) => s.key)).toEqual(["BILL-163"]);
    expect(evaluatePrfaqAgreement(epic, ctx).map((r) => r.key)).not.toContain("serves_no_promise");
  });

  it("drafts: dr1 and dr3 expire in 5 days, dr2 in 2, dr4 tomorrow, dr5 in 3; dr6 is already expired", () => {
    const ctx = seeded();
    const byId = Object.fromEntries(ctx.drafts.map((d) => [d.id, d]));
    const session = ctx.sessions[0];

    expect(session.date.getTime()).toBe(NOW.getTime() + 5 * 86_400_000);
    expect(daysUntilExpiry(byId.dr1, NOW)).toBe(5);
    expect(byId.dr1.expiresAt).toEqual(session.date);
    expect(daysUntilExpiry(byId.dr3, NOW)).toBe(5);
    expect(byId.dr3.expiresAt).toEqual(session.date);
    expect(daysUntilExpiry(byId.dr2, NOW)).toBe(2);
    expect(daysUntilExpiry(byId.dr4, NOW)).toBe(1);
    expect(daysUntilExpiry(byId.dr5, NOW)).toBe(3);
    expect(isExpired(byId.dr6, NOW)).toBe(true);
    for (const id of ["dr1", "dr2", "dr3", "dr4", "dr5"]) expect(isExpired(byId[id], NOW)).toBe(false);
  });
});
