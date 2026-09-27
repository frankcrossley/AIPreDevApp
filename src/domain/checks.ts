// Right thing, Built right and PRFAQ agreement, computed on read (ADR-007).
// Pure functions over a DomainSnapshot. See docs/domain.md "Floor checks".

import type {
  Blocker,
  CheckResult,
  CheckScope,
  CheckTier,
  DomainSnapshot,
  Epic,
  Stance,
  Story,
  Template,
} from "./types";

interface CheckDefinition {
  key: string;
  scope: Exclude<CheckScope, "prfaq_agreement">;
  tier: CheckTier;
  label: string;
}

type Evaluation = { passedReason: string; blockers: Blocker[]; failedReason?: (blockers: Blocker[]) => string };
type Evaluator = (story: Story, ctx: DomainSnapshot) => Evaluation;

const def = (key: string, scope: CheckDefinition["scope"], tier: CheckTier, label: string): CheckDefinition => ({
  key,
  scope,
  tier,
  label,
});

export const CHECK_DEFINITIONS: Record<string, CheckDefinition> = Object.fromEntries(
  [
    def("serves_promise", "right_thing", "floor", "Serves a promise"),
    def("evidence_backed", "right_thing", "floor", "Backed by evidence"),
    def("success_measure_linked", "right_thing", "floor", "Success measure linked"),
    def("team_aligned", "right_thing", "floor", "Team aligned on the PRFAQ"),
    def("no_blocking_questions", "built_right", "floor", "No blocking questions"),
    def("no_unresolved_conflicts", "built_right", "floor", "No unresolved conflicts"),
    def("stances_complete", "built_right", "floor", "Stances complete"),
    def("claims_sourced", "built_right", "floor", "Claims sourced"),
    def("criteria_traced", "built_right", "floor", "Criteria traced"),
    def("within_promise_scope", "right_thing", "team", "Within the promise's scope"),
    def("arch_questions_answered", "built_right", "team", "Architecture questions answered"),
    def("estimated", "built_right", "team", "Estimated"),
    def("mock_if_ui_change", "built_right", "team", "Mock for UI changes"),
  ].map((d) => [d.key, d]),
);

export const FLOOR_CHECK_KEYS = {
  right_thing: ["serves_promise", "evidence_backed", "success_measure_linked", "team_aligned"],
  built_right: [
    "no_blocking_questions",
    "no_unresolved_conflicts",
    "stances_complete",
    "claims_sourced",
    "criteria_traced",
  ],
} as const satisfies Record<CheckDefinition["scope"], readonly string[]>;

const ALL_FLOOR_KEYS: ReadonlySet<string> = new Set([...FLOOR_CHECK_KEYS.right_thing, ...FLOOR_CHECK_KEYS.built_right]);

/** Floor checks always apply, then the template's team checks for this scope. */
export function effectiveCheckKeys(template: Template | undefined, scope: CheckDefinition["scope"]): string[] {
  const team = (template?.teamCheckKeys ?? []).filter(
    (k) => CHECK_DEFINITIONS[k]?.scope === scope && !ALL_FLOOR_KEYS.has(k),
  );
  return [...FLOOR_CHECK_KEYS[scope], ...team];
}

/** Sets a template's team checks. Floor checks can't be listed here, so they can't be removed either. */
export function updateTeamChecks(template: Template, teamCheckKeys: string[]): Template {
  for (const key of teamCheckKeys) {
    if (ALL_FLOOR_KEYS.has(key)) throw new Error(`${key} is a floor check. It always applies and isn't a team check.`);
    if (!CHECK_DEFINITIONS[key]) throw new Error(`Unknown check ${key}`);
  }
  return { ...template, teamCheckKeys: [...new Set(teamCheckKeys)] };
}

// ---------- helpers ----------

const nameOf = (ctx: DomainSnapshot, personId: string) => ctx.people.find((p) => p.id === personId)?.name ?? personId;

const quote = (text: string) => `"${text}"`;

/** The newest stance per person. Ties keep the later entry. */
export function latestStances(stances: Stance[]): Map<string, Stance> {
  const latest = new Map<string, Stance>();
  for (const s of stances) {
    const prev = latest.get(s.personId);
    if (!prev || s.createdAt.getTime() >= prev.createdAt.getTime()) latest.set(s.personId, s);
  }
  return latest;
}

/** Ids of everything that belongs to a story: the story, its blocks, items and criteria. */
function storyContentIds(story: Story, ctx: DomainSnapshot): Set<string> {
  const ids = new Set<string>([story.id]);
  for (const b of ctx.blocks) if (b.parentType === "story" && b.parentId === story.id) ids.add(b.id);
  for (const i of ctx.items) if (i.parentType === "story" && i.parentId === story.id && isLiveItem(i)) ids.add(i.id);
  for (const c of ctx.criteria) if (c.storyId === story.id) ids.add(c.id);
  return ids;
}

/** Items that still count: archived (turned back into text) and dropped items are history only. */
export const isLiveItem = (i: { status: string }) => i.status !== "archived" && i.status !== "dropped";

const storyItems = (story: Story, ctx: DomainSnapshot) =>
  ctx.items.filter((i) => i.parentType === "story" && i.parentId === story.id && isLiveItem(i));

const openHatNotes = (story: Story, ctx: DomainSnapshot) => {
  const ids = storyContentIds(story, ctx);
  return ctx.hatNotes.filter((h) => h.status === "open" && ids.has(h.targetId));
};

const prfaqFor = (story: Story, ctx: DomainSnapshot) => ctx.prfaqs.find((p) => p.epicId === story.epicId);

const noPrfaqBlocker = (story: Story): Blocker => ({
  reason: "The epic has no PRFAQ yet",
  fixTarget: { type: "epic", id: story.epicId },
});

// ---------- story checks ----------

const EVALUATORS: Record<string, Evaluator> = {
  serves_promise: (story, ctx) => {
    const prfaq = prfaqFor(story, ctx);
    const promise = ctx.promises.find((p) => p.id === story.promiseId && p.prfaqId === prfaq?.id);
    return {
      passedReason: promise ? `Serves ${quote(promise.text)}` : "",
      blockers: promise
        ? []
        : [
            {
              reason: story.promiseId
                ? `Promise ${story.promiseId} isn't in this epic's PRFAQ`
                : "Doesn't serve a promise yet",
              fixTarget: { type: "story", id: story.id },
            },
          ],
    };
  },

  evidence_backed: (story, ctx) => {
    const ids = storyContentIds(story, ctx);
    const n = ctx.citations.filter((c) => c.toType === "excerpt" && ids.has(c.fromId)).length;
    return {
      passedReason: `${n} citation${n === 1 ? "" : "s"} to source excerpts`,
      blockers: n ? [] : [{ reason: "Nothing cites a source excerpt yet", fixTarget: { type: "story", id: story.id } }],
    };
  },

  success_measure_linked: (story, ctx) => {
    const prfaq = prfaqFor(story, ctx);
    if (!prfaq) return { passedReason: "", blockers: [noPrfaqBlocker(story)] };
    const ok = Boolean(prfaq.successMeasure?.trim());
    return {
      passedReason: "The epic's PRFAQ has a success measure",
      blockers: ok ? [] : [{ reason: "The PRFAQ has no success measure", fixTarget: { type: "prfaq", id: prfaq.id } }],
    };
  },

  team_aligned: (story, ctx) => {
    const prfaq = prfaqFor(story, ctx);
    if (!prfaq) return { passedReason: "", blockers: [noPrfaqBlocker(story)] };
    if (prfaq.state !== "agreed") {
      return { passedReason: "", blockers: [{ reason: "The epic's PRFAQ isn't agreed yet", fixTarget: { type: "prfaq", id: prfaq.id } }] };
    }
    // Computed, not trusted (rule 4): the agreement must still hold, e.g. after a new read-back.
    const epic = ctx.epics.find((e) => e.id === story.epicId);
    const broken = epic ? evaluatePrfaqAgreement(epic, ctx).filter((r) => !r.passed).flatMap((r) => r.blockers) : [];
    return {
      passedReason: "The team agreed the PRFAQ",
      blockers: broken.map((b) => ({ reason: `The PRFAQ was agreed, but no longer holds: ${b.reason}`, fixTarget: b.fixTarget })),
    };
  },

  within_promise_scope: (story, ctx) => ({
    passedReason: "No open scope notes from the Product hat",
    blockers: openHatNotes(story, ctx)
      .filter((h) => h.hat === "pm")
      .map((h) => ({ reason: `Product hat: ${h.text}`, fixTarget: { type: "hatNote", id: h.id } })),
  }),

  no_blocking_questions: (story, ctx) => ({
    passedReason: "No open blocking questions",
    blockers: storyItems(story, ctx)
      .filter((i) => i.type === "question" && i.blocking && i.status === "open")
      .map((i) => ({ reason: `Open blocking question: ${quote(i.text)}`, fixTarget: { type: "item", id: i.id } })),
  }),

  no_unresolved_conflicts: (story, ctx) => {
    const conflicts: Blocker[] = openHatNotes(story, ctx)
      .filter((h) => h.kind === "conflict")
      .map((h) => ({ reason: `Open conflict: ${h.text}`, fixTarget: { type: "hatNote", id: h.id } }));
    for (const item of storyItems(story, ctx)) {
      const latest = latestStances(ctx.stances.filter((s) => s.itemId === item.id));
      for (const s of latest.values()) {
        if (s.value === "object") {
          conflicts.push({
            reason: `${nameOf(ctx, s.personId)} objects to ${quote(item.text)}${s.reason ? `: ${s.reason}` : ""}`,
            fixTarget: { type: "item", id: item.id },
            personId: s.personId,
          });
        }
      }
    }
    return { passedReason: "No open conflicts or objections", blockers: conflicts };
  },

  stances_complete: (story, ctx) => {
    const blockers: Blocker[] = [];
    for (const item of storyItems(story, ctx).filter((i) => i.type === "decision")) {
      const given = new Set(
        ctx.stances.filter((s) => s.itemId === item.id && s.round === item.stanceRound).map((s) => s.personId),
      );
      for (const personId of item.requiredStanceIds.filter((p) => !given.has(p))) {
        blockers.push({
          reason: `Waiting on ${nameOf(ctx, personId)} for ${quote(item.text)}`,
          fixTarget: { type: "item", id: item.id },
          personId,
        });
      }
    }
    return {
      passedReason: "Every decision has a stance from everyone it needs",
      blockers,
      failedReason: (b) => `No stance yet from ${[...new Set(b.map((x) => nameOf(ctx, x.personId!)))].join(", ")}`,
    };
  },

  claims_sourced: (story, ctx) => {
    const template = ctx.templates.find((t) => t.id === story.templateId);
    const required = new Set(template?.requiredSections ?? []);
    const cited = new Set(ctx.citations.filter((c) => c.fromType === "block").map((c) => c.fromId));
    const ownedAssumptionBlocks = new Set(
      storyItems(story, ctx)
        .filter((i) => i.type === "assumption" && i.ownerId && i.blockId)
        .map((i) => i.blockId!),
    );
    const blockers: Blocker[] = ctx.blocks
      .filter((b) => b.parentType === "story" && b.parentId === story.id && required.has(b.section))
      .filter((b) => !cited.has(b.id) && !ownedAssumptionBlocks.has(b.id))
      .sort((a, b) => a.order - b.order)
      .map((b) => ({
        reason: `Unsourced in ${b.section}: ${quote(b.text)}`,
        fixTarget: { type: "block", id: b.id },
      }));
    return { passedReason: "Every claim in a required section is sourced or an owned assumption", blockers };
  },

  criteria_traced: (story, ctx) => {
    const criteria = ctx.criteria.filter((c) => c.storyId === story.id);
    if (!criteria.length) {
      return {
        passedReason: "",
        blockers: [{ reason: "No acceptance criteria yet", fixTarget: { type: "story", id: story.id } }],
      };
    }
    const cited = new Set(ctx.citations.filter((c) => c.fromType === "criterion").map((c) => c.fromId));
    const blockers: Blocker[] = [];
    for (const c of criteria) {
      if (!cited.has(c.id)) blockers.push({ reason: `Criterion "${c.then}" has no citations`, fixTarget: { type: "criterion", id: c.id } });
      if (c.origin === "hat" && !c.confirmedBy)
        blockers.push({ reason: `Criterion "${c.then}" came from a hat and isn't confirmed by a person`, fixTarget: { type: "criterion", id: c.id } });
    }
    return { passedReason: `${criteria.length} criteria, all traced`, blockers };
  },

  arch_questions_answered: (story, ctx) => ({
    passedReason: "No open Architect challenges",
    blockers: openHatNotes(story, ctx)
      .filter((h) => h.hat === "arch" && h.kind === "challenge")
      .map((h) => ({ reason: `Architect: ${h.text}`, fixTarget: { type: "hatNote", id: h.id } })),
  }),

  estimated: (story) => ({
    passedReason: `Estimated at ${story.estimate}`,
    blockers: story.estimate === null ? [{ reason: "Not estimated yet", fixTarget: { type: "story", id: story.id } }] : [],
  }),

  mock_if_ui_change: (story) => ({
    passedReason: story.hasUiChange ? "Mock linked" : "No UI change",
    blockers:
      story.hasUiChange && !story.mockUri
        ? [{ reason: "Changes the UI but has no mock linked", fixTarget: { type: "story", id: story.id } }]
        : [],
  }),
};

function toResult(
  definition: { key: string; tier: CheckTier; label: string },
  evaluation: Evaluation,
  scope: CheckScope,
): CheckResult {
  const { blockers } = evaluation;
  const passed = blockers.length === 0;
  return {
    key: definition.key,
    scope,
    tier: definition.tier,
    label: definition.label,
    passed,
    reason: passed
      ? evaluation.passedReason
      : evaluation.failedReason?.(blockers) ??
        (blockers.length === 1 ? blockers[0].reason : `${blockers[0].reason} (and ${blockers.length - 1} more)`),
    fixTarget: passed ? null : blockers[0].fixTarget,
    blockers,
  };
}

function evaluateScope(story: Story, ctx: DomainSnapshot, scope: CheckDefinition["scope"]): CheckResult[] {
  const template = ctx.templates.find((t) => t.id === story.templateId);
  return effectiveCheckKeys(template, scope).map((key) => toResult(CHECK_DEFINITIONS[key], EVALUATORS[key](story, ctx), scope));
}

export function evaluateRightThing(story: Story, ctx: DomainSnapshot): CheckResult[] {
  return evaluateScope(story, ctx, "right_thing");
}

export function evaluateBuiltRight(story: Story, ctx: DomainSnapshot): CheckResult[] {
  return evaluateScope(story, ctx, "built_right");
}

export function allChecksPass(story: Story, ctx: DomainSnapshot): boolean {
  return [...evaluateRightThing(story, ctx), ...evaluateBuiltRight(story, ctx)].every((r) => r.passed);
}

// ---------- PRFAQ agreement (epic) ----------

const prfaqDef = (key: string, label: string) => ({ key, tier: "floor" as const, label });

export function evaluatePrfaqAgreement(epic: Epic, ctx: DomainSnapshot): CheckResult[] {
  const prfaq = ctx.prfaqs.find((p) => p.epicId === epic.id);
  const noPrfaq: Blocker[] = prfaq ? [] : [{ reason: "The epic has no PRFAQ yet", fixTarget: { type: "epic", id: epic.id } }];
  const readBacks = ctx.readBacks.filter((r) => r.epicId === epic.id);
  const byPerson = new Map(readBacks.map((r) => [r.personId, r]));

  const missing: Blocker[] = epic.memberIds
    .filter((id) => !byPerson.has(id))
    .map((id) => ({ reason: `No read-back from ${nameOf(ctx, id)}`, fixTarget: { type: "person", id }, personId: id }));

  const notMatching: Blocker[] = epic.memberIds
    .map((id) => byPerson.get(id))
    .filter((r) => r !== undefined && r.assessment !== "matches")
    .map((r) => ({
      reason: `${nameOf(ctx, r!.personId)}'s read-back ${r!.assessment === "pending" ? "isn't assessed yet" : r!.assessment === "too_close" ? "just repeats the PRFAQ" : "diverges"}${r!.note ? `: ${r!.note}` : ""}`,
      fixTarget: { type: "readBack", id: r!.id },
      personId: r!.personId,
    }));

  const faqs: Blocker[] = ctx.faqEntries
    .filter((f) => f.prfaqId === prfaq?.id && f.audience === "internal" && f.blocking && !f.answer?.trim())
    .map((f) => ({ reason: `Blocking FAQ unanswered: ${quote(f.question)}`, fixTarget: { type: "faq", id: f.id } }));

  const stories = ctx.stories.filter((s) => s.epicId === epic.id && !s.archivedAt);
  const unserved: Blocker[] = ctx.promises
    .filter((p) => p.prfaqId === prfaq?.id && !stories.some((s) => s.promiseId === p.id))
    .map((p) => ({ reason: `No story serves ${quote(p.text)}`, fixTarget: { type: "promise", id: p.id } }));

  const results: [{ key: string; tier: CheckTier; label: string }, Evaluation][] = [
    [prfaqDef("readbacks_complete", "Every member has read back"), { passedReason: "Every member has read back", blockers: [...noPrfaq, ...missing] }],
    [prfaqDef("readbacks_match", "Read-backs match"), { passedReason: "Every read-back matches", blockers: [...noPrfaq, ...notMatching] }],
    [prfaqDef("blocking_faq_answered", "Blocking FAQs answered"), { passedReason: "No blocking internal FAQ is unanswered", blockers: [...noPrfaq, ...faqs] }],
    [prfaqDef("promises_served", "Every promise served"), { passedReason: "Every promise is served by a story", blockers: [...noPrfaq, ...unserved] }],
  ];
  return results.map(([d, e]) => toResult(d, e, "prfaq_agreement"));
}

/** Stories on the epic that serve no promise. Flagged on the epic, never blocking agreement. */
export function storiesServingNoPromise(epic: Epic, ctx: DomainSnapshot): Story[] {
  const promiseIds = new Set(ctx.promises.map((p) => p.id));
  return ctx.stories.filter((s) => s.epicId === epic.id && !s.archivedAt && (!s.promiseId || !promiseIds.has(s.promiseId)));
}
