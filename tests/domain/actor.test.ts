// 01-workspace "Switching who I'm acting as": resolving the viewing-as cookie.
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const { resolveActor } = await import("@/server/actor");
import { seeded } from "../fixtures";

describe("viewing as", () => {
  const people = seeded().people;
  it("uses the person the cookie names", () => {
    expect(resolveActor("marcus", people).id).toBe("marcus");
  });
  it("falls back to the first product person for a missing or unknown cookie", () => {
    expect(resolveActor(undefined, people).id).toBe("priya");
    expect(resolveActor("mallory", people).id).toBe("priya");
  });
});
