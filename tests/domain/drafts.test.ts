// Draft rules (docs/domain.md "Draft rules"): expiry, archiving, restoring.
import { describe, expect, it } from "vitest";
import { addDays, draftExpiresAt, expireDrafts, isExpired, restoreDraft } from "@/domain/drafts";
import type { Session } from "@/domain/types";
import { NOW, seeded, seedJson } from "../fixtures";
import { normaliseSeed } from "@/seed/normalise";

const session = (inDays: number, status: Session["status"] = "planned"): Session => ({
  id: `s${inDays}`,
  date: addDays(NOW, inDays),
  lengthMinutes: 60,
  attendeeIds: [],
  agenda: [],
  status,
  captureText: "",
});

describe("draftExpiresAt", () => {
  it("uses the day limit when there's no session", () => {
    expect(draftExpiresAt(NOW, 10, [])).toEqual(addDays(NOW, 10));
  });
  it("uses the next session's start when it comes first", () => {
    expect(draftExpiresAt(NOW, 10, [session(4), session(2)])).toEqual(addDays(NOW, 2));
  });
  it("uses the day limit when the session is later", () => {
    expect(draftExpiresAt(NOW, 3, [session(5)])).toEqual(addDays(NOW, 3));
  });
  it("a session exactly at the day limit gives the same instant", () => {
    expect(draftExpiresAt(NOW, 5, [session(5)])).toEqual(addDays(NOW, 5));
  });
  it("ignores ended sessions and sessions before the draft was created", () => {
    expect(draftExpiresAt(NOW, 10, [session(3, "ended"), session(-1)])).toEqual(addDays(NOW, 10));
  });
});

describe("expiry and archive", () => {
  it("dr6 expires by the rule, not only because the seed says so", () => {
    const seed = structuredClone(seedJson);
    delete seed.drafts.find((d: { id: string }) => d.id === "dr6").status;
    const ctx = normaliseSeed(seed, NOW).snapshot;
    const dr6 = ctx.drafts.find((d) => d.id === "dr6")!;
    expect(dr6.status).toBe("pending");
    expect(dr6.expiresAt).toEqual(addDays(NOW, -1));
    expect(expireDrafts(ctx.drafts, NOW).map((d) => [d.id, d.status])).toEqual([["dr6", "expired"]]);
  });

  it("archives, never deletes: other drafts are untouched and the expired one keeps its text", () => {
    const ctx = seeded();
    const later = addDays(NOW, 2);
    const changed = expireDrafts(ctx.drafts, later);
    expect(changed.map((d) => d.id).sort()).toEqual(["dr2", "dr4"]);
    expect(changed.find((d) => d.id === "dr4")!.text).toBe(ctx.drafts.find((d) => d.id === "dr4")!.text);
    expect(ctx.drafts.find((d) => d.id === "dr4")!.status).toBe("pending");
  });

  it("leaves triaged drafts alone", () => {
    const ctx = seeded();
    expect(expireDrafts(ctx.drafts, addDays(NOW, 30)).map((d) => d.id)).not.toContain("draft-sam-lines");
  });

  it("restores an expired draft with a fresh expiry counted from now", () => {
    const ctx = seeded();
    const dr6 = ctx.drafts.find((d) => d.id === "dr6")!;
    const restored = restoreDraft(dr6, NOW, ctx);
    expect(restored.status).toBe("pending");
    expect(restored.expiresAt).toEqual(ctx.sessions[0].date);
    expect(isExpired(restored, NOW)).toBe(false);
  });

  it("only expired drafts can be restored", () => {
    const ctx = seeded();
    expect(() => restoreDraft(ctx.drafts.find((d) => d.id === "dr1")!, NOW, ctx)).toThrow();
  });
});
