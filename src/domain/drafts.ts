// Draft rules from docs/domain.md. Pure functions; the Scrum Master uses them (ADR-006).

import type { Draft, DomainSnapshot, ParentType, Session } from "./types";

export const DEFAULT_DRAFT_EXPIRY_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Expiry days from the target's template, or the default. */
export function draftExpiryDays(
  target: { targetType: ParentType | null; targetId: string | null },
  ctx: Pick<DomainSnapshot, "stories" | "epics" | "templates">,
): number {
  let templateId: string | undefined;
  if (target.targetType === "story") {
    templateId = ctx.stories.find((s) => s.id === target.targetId)?.templateId;
  } else if (target.targetType === "epic") {
    templateId = ctx.epics.find((e) => e.id === target.targetId)?.templateId;
  }
  const template = ctx.templates.find((t) => t.id === templateId);
  return template?.draftExpiryDays ?? DEFAULT_DRAFT_EXPIRY_DAYS;
}

/** The first planned or live session that starts at or after `from`. */
export function nextSessionStart(sessions: Session[], from: Date): Date | null {
  const upcoming = sessions
    .filter((s) => s.status !== "ended" && s.date.getTime() >= from.getTime())
    .map((s) => s.date.getTime())
    .sort((a, b) => a - b);
  return upcoming.length ? new Date(upcoming[0]) : null;
}

/** Whichever comes first: `from + expiryDays`, or the start of the next session after `from`. */
export function draftExpiresAt(from: Date, expiryDays: number, sessions: Session[]): Date {
  const byDays = addDays(from, expiryDays);
  const session = nextSessionStart(sessions, from);
  return session && session.getTime() < byDays.getTime() ? session : byDays;
}

export function isExpired(draft: Draft, now: Date): boolean {
  return draft.status === "expired" || (draft.status === "pending" && now.getTime() >= draft.expiresAt.getTime());
}

/**
 * Archives pending drafts that have passed their expiry. Returns the changed drafts only.
 * Expired drafts are kept, never deleted, so they can be restored.
 */
export function expireDrafts(drafts: Draft[], now: Date): Draft[] {
  return drafts
    .filter((d) => d.status === "pending" && now.getTime() >= d.expiresAt.getTime())
    .map((d) => ({ ...d, status: "expired" as const }));
}

/** Brings an expired draft back as pending, with a fresh expiry counted from `now`. */
export function restoreDraft(
  draft: Draft,
  now: Date,
  ctx: Pick<DomainSnapshot, "stories" | "epics" | "templates" | "sessions">,
): Draft {
  if (draft.status !== "expired") {
    throw new Error(`Draft ${draft.id} is ${draft.status}, only expired drafts can be restored`);
  }
  return {
    ...draft,
    status: "pending",
    expiresAt: draftExpiresAt(now, draftExpiryDays(draft, ctx), ctx.sessions),
  };
}

/** Whole days from `now` until the draft expires, rounded up. Negative once expired. */
export function daysUntilExpiry(draft: Draft, now: Date): number {
  return Math.ceil((draft.expiresAt.getTime() - now.getTime()) / DAY_MS);
}

/** "expires in 2 days", "expires tomorrow", "expires today", "expired", counted in calendar days (UTC). */
export function expiryLabel(draft: Pick<Draft, "expiresAt" | "status">, now: Date): string {
  if (draft.status === "expired" || draft.expiresAt.getTime() <= now.getTime()) return "expired";
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((day(draft.expiresAt) - day(now)) / DAY_MS);
  return days <= 0 ? "expires today" : days === 1 ? "expires tomorrow" : `expires in ${days} days`;
}
