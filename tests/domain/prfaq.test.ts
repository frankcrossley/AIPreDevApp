// 05-prfaq-alignment, domain side.
import { describe, expect, it } from "vitest";
import { evaluateRightThing } from "@/domain/checks";
import {
  afterPrfaqEdit,
  assessReadBackStub,
  canAgreePrfaq,
  editPrfaqFields,
  prfaqView,
  setCustomerQuote,
  similarity,
  tooClose,
  upsertFaq,
  writeReadBack,
} from "@/domain/prfaq";
import { canPutToSession } from "@/domain/triage";
import type { DomainSnapshot } from "@/domain/types";
import { NOW, seeded, story } from "../fixtures";

const epic = (ctx: DomainSnapshot) => ctx.epics[0];
const prfaq = (ctx: DomainSnapshot) => ctx.prfaqs[0];

describe("customer FAQ links to stories", () => {
  it("faq-1 → BILL-150; faq-2 → BILL-151, still open", () => {
    const ctx = seeded();
    const v = prfaqView(epic(ctx), ctx, "priya");
    const faq = (id: string) => v.faqs.find((f) => f.id === id)!;
    expect(faq("faq-1").stories).toEqual([{ id: "bill-150", key: "BILL-150", title: "Plan changes mid-cycle", open: true }]);
    expect(faq("faq-2").stories.map((s) => [s.key, s.open])).toEqual([["BILL-151", true]]);
  });
});

describe("the customer quote is real", () => {
  it("shows its source and locator, and can only be another verbatim excerpt", () => {
    const ctx = seeded();
    expect(prfaqView(epic(ctx), ctx, "priya").quote).toEqual({ text: "Only if we can see it in real time. We budget by department.", source: "Discovery call · Acme Corp", locator: "14:32" });
    expect(setCustomerQuote(prfaq(ctx), "ex-acme-1240", ctx).customerQuoteExcerptId).toBe("ex-acme-1240");
    expect(() => setCustomerQuote(prfaq(ctx), "ex-survey-overcharged", ctx)).toThrow(/real source/);
    expect(() => setCustomerQuote(prfaq(ctx), "made-up", ctx)).toThrow();
  });
});

describe("read-backs", () => {
  it("every member is asked; Security has none yet", () => {
    const ctx = seeded();
    expect(prfaqView(epic(ctx), ctx, "security").prompt).toEqual({ existing: null });
    expect(prfaqView(epic(ctx), ctx, "jo").prompt).toBeNull();
    expect(prfaqView(epic(ctx), ctx, "security").readBacks.find((r) => r.personId === "security")!.assessment).toBeNull();
  });

  it("Dan's diverges, with a note, and can be talked through at the next session", () => {
    const ctx = seeded();
    const dan = prfaqView(epic(ctx), ctx, "priya").readBacks.find((r) => r.personId === "dan")!;
    expect(dan).toMatchObject({ assessment: "diverges", note: "The PRFAQ bills monthly and shows usage hourly. Hourly billing isn't in it.", talkItThrough: "rb-bill-142-dan" });
    expect(canPutToSession(ctx.sessions[0], "rb-bill-142-dan", "bill-142", ctx)).toEqual({ ok: true });
    expect(canPutToSession(ctx.sessions[0], "rb-bill-142-dan", "bill-150", ctx)).toMatchObject({ ok: false });
  });

  it("writing one uses the stand-in assessment, and says so", () => {
    const ctx = seeded();
    const rb = writeReadBack({ ctx, epic: epic(ctx), personId: "security", text: "Usage pricing that stores no new personal data.", now: NOW });
    expect(rb).toMatchObject({ id: "rb-bill-142-security", assessment: "matches" });
    expect(rb.note).toMatch(/stand-in rule/);
    expect(() => writeReadBack({ ctx, epic: epic(ctx), personId: "jo", text: "Usage pricing for everyone.", now: NOW })).toThrow(/members/);
    expect(() => writeReadBack({ ctx, epic: epic(ctx), personId: "sam", text: "ok", now: NOW })).toThrow(/full line/);
  });
});

describe("pasting the headline doesn't count", () => {
  it("similarity is 1 for the same text and low for a different one", () => {
    expect(similarity("Pay per use.", "pay per use")).toBe(1);
    expect(similarity("Pay per use, fair on plan changes", "Tax is calculated in-house")).toBeLessThan(0.4);
  });

  it("over 0.85 to any PRFAQ sentence is too close", () => {
    const ctx = seeded();
    const headline = prfaq(ctx).headline;
    expect(tooClose(headline, prfaq(ctx), ctx).tooClose).toBe(true);
    expect(tooClose("API customers now pay for what they use and can see it as they go!", prfaq(ctx), ctx).tooClose).toBe(true);
    expect(tooClose("Pay per use, fair on plan changes, no shocks for big accounts.", prfaq(ctx), ctx).tooClose).toBe(false);
    expect(assessReadBackStub(headline, prfaq(ctx), ctx)).toEqual({ assessment: "too_close", note: "Too close to the page, say it in your own words." });
  });
});

describe("stories that serve no promise", () => {
  it("BILL-163, with three actions; only the owner can take them", () => {
    const ctx = seeded();
    expect(prfaqView(epic(ctx), ctx, "priya").unpromised).toEqual([
      { id: "bill-163", key: "BILL-163", title: "Invoices grouped by project", addReason: null, moveReason: null, dropReason: null },
    ]);
    expect(prfaqView(epic(ctx), ctx, "sam").unpromised[0].addReason).toBe("Priya owns the PRFAQ");
  });
});

describe("the PRFAQ can't be agreed early", () => {
  it("lists Dan's divergence, Security's missing read-back and faq-4", () => {
    const ctx = seeded();
    const r = canAgreePrfaq("priya", epic(ctx), ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons.join("\n")).toMatch(/Dan's read-back diverges/);
    expect(r.reasons.join("\n")).toMatch(/No read-back from Security/);
    expect(r.reasons.join("\n")).toMatch(/Blocking FAQ unanswered/);
    for (const s of ctx.stories.filter((x) => x.epicId === "bill-142")) {
      expect(evaluateRightThing(s, ctx).find((x) => x.key === "team_aligned")!.passed, s.key).toBe(false);
    }
  });

  it("the demo: answer the flat-fee FAQ, Dan realigns, Security reads back, and the owner can agree", () => {
    const ctx = seeded();
    const faq4 = ctx.faqEntries.find((f) => f.id === "faq-4")!;
    Object.assign(faq4, upsertFaq(prfaq(ctx), { ...faq4, answer: "They keep today's fee, capped, for 18 months, then choose." }, ctx));
    for (const [personId, text] of [
      ["dan", "Monthly usage billing, with live usage visible so customers can budget."],
      ["security", "Usage pricing that stores no new personal data."],
    ]) {
      const rb = writeReadBack({ ctx, epic: epic(ctx), personId, text, now: NOW });
      ctx.readBacks = [...ctx.readBacks.filter((r) => r.id !== rb.id), rb];
    }
    expect(canAgreePrfaq("sam", epic(ctx), ctx)).toEqual({ ok: false, reasons: ["Priya or Head of Product agrees the PRFAQ"] });
    expect(canAgreePrfaq("hop", epic(ctx), ctx)).toEqual({ ok: true, reasons: [] });
    expect(canAgreePrfaq("priya", epic(ctx), ctx)).toEqual({ ok: true, reasons: [] });
    prfaq(ctx).state = "agreed";
    expect(evaluateRightThing(story(ctx, "BILL-150"), ctx).every((r) => r.passed)).toBe(true);
  });
});

describe("editing an agreed PRFAQ", () => {
  it("goes back to draft, and too-close read-backs are worked out again", () => {
    const ctx = seeded();
    prfaq(ctx).state = "agreed";
    const edited = editPrfaqFields(prfaq(ctx), { headline: "Pay per use, fair on plan changes, no shocks for big accounts." });
    const r = afterPrfaqEdit(edited, { ...ctx, prfaqs: [edited] });
    expect(r.prfaq.state).toBe("draft");
    expect(r.readBacks.map((x) => [x.personId, x.assessment])).toEqual([["priya", "too_close"]]);
  });

  it("refuses to empty the headline", () => {
    const ctx = seeded();
    expect(() => editPrfaqFields(prfaq(ctx), { headline: " " })).toThrow();
  });

  it("only internal FAQs can block, and stories must be on the epic", () => {
    const ctx = seeded();
    expect(upsertFaq(prfaq(ctx), { id: "f9", audience: "customer", question: "Q?", answer: null, storyIds: [], blocking: true }, ctx).blocking).toBe(false);
    expect(() => upsertFaq(prfaq(ctx), { id: "f9", audience: "customer", question: "Q?", answer: null, storyIds: ["nope"], blocking: false }, ctx)).toThrow();
  });
});
