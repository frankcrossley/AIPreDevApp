// Domain types. Pure data: no Prisma, no React. See docs/domain.md.

export type Role =
  | "product"
  | "finance"
  | "sales"
  | "tech_lead"
  | "design"
  | "security"
  | "head_of_product"
  | "scribe";

export interface Person {
  id: string;
  name: string;
  role: Role;
}

export interface Template {
  id: string;
  name: string;
  sections: string[];
  /** Sections whose blocks must be sourced (claims_sourced). */
  requiredSections: string[];
  teamCheckKeys: string[];
  requiresPrfaq: boolean;
  draftExpiryDays: number;
  silenceRule: string;
  disagreementRule: string;
}

export interface Epic {
  id: string;
  key: string;
  title: string;
  ownerId: string;
  deciderId: string;
  templateId: string;
  memberIds: string[];
}

export const STORY_STATES = [
  "draft",
  "triaged",
  "in_refinement",
  "agreed",
  "ready",
  "exported",
] as const;
export type StoryState = (typeof STORY_STATES)[number];

export interface Story {
  id: string;
  key: string;
  epicId: string;
  title: string;
  leadId: string;
  templateId: string;
  state: StoryState;
  promiseId: string | null;
  estimate: number | null;
  hasUiChange: boolean;
  /** Link to a design mock. Satisfies mock_if_ui_change. */
  mockUri: string | null;
  jiraKey: string | null;
  sprint: string | null;
  signedOffBy: string | null;
  signedOffAt: Date | null;
}

export type ParentType = "story" | "epic";

export interface Block {
  id: string;
  parentType: ParentType;
  parentId: string;
  section: string;
  order: number;
  text: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ItemType = "decision" | "question" | "assumption" | "risk" | "talking_point" | (string & {});
export type ItemStatus = "open" | "resolved" | "dropped";

export interface Item {
  id: string;
  parentType: ParentType;
  parentId: string;
  blockId: string | null;
  type: ItemType;
  text: string;
  status: ItemStatus;
  ownerId: string | null;
  blocking: boolean;
  requiredStanceIds: string[];
  /** Stance round currently being asked. Editing agreed content starts a new round. */
  stanceRound: number;
}

export type StanceValue = "agree" | "concern" | "object";

export interface Stance {
  id: string;
  itemId: string;
  personId: string;
  value: StanceValue;
  reason: string | null;
  round: number;
  createdAt: Date;
}

export type SourceKind = "call" | "survey" | "ticket" | "doc" | "chat" | "code" | "adr";

export interface Source {
  id: string;
  kind: SourceKind;
  title: string;
  date: Date | null;
  uri: string | null;
}

export interface Excerpt {
  id: string;
  sourceId: string;
  text: string;
  locator: string;
  /** `quote` for verbatim text, `theme` for a computed survey theme. */
  kind: "quote" | "theme";
  note: string | null;
}

export type CitationFrom = "block" | "item" | "criterion" | "promise";
export type CitationTo = "block" | "excerpt";

export interface Citation {
  id: string;
  fromType: CitationFrom;
  fromId: string;
  toType: CitationTo;
  toId: string;
}

export type DraftStatus = "pending" | "accepted" | "merged" | "rejected" | "expired";

export interface Draft {
  id: string;
  targetType: ParentType | null;
  targetId: string | null;
  text: string;
  authorId: string | null;
  excerptId: string | null;
  sourceId: string | null;
  createdAt: Date;
  expiresAt: Date;
  status: DraftStatus;
  triagedBy: string | null;
  triagedAt: Date | null;
  /** The block created when the draft was accepted or merged. */
  resultBlockId: string | null;
}

export type Hat = "qa" | "arch" | "eng" | "sec" | "pm";
export type HatNoteKind = "challenge" | "gap" | "conflict" | "suggestion";

export interface HatNote {
  id: string;
  hat: Hat;
  targetType: "story" | "epic" | "block" | "item" | "criterion";
  targetId: string;
  kind: HatNoteKind;
  text: string;
  refs: string[];
  status: "open" | "accepted" | "dismissed";
}

export interface Criterion {
  id: string;
  storyId: string;
  given: string;
  when: string;
  then: string;
  origin: "notes" | "hat";
  hat: string | null;
  confirmedBy: string | null;
}

export interface Prfaq {
  id: string;
  epicId: string;
  headline: string;
  subhead: string;
  problem: string;
  whatChanges: string;
  customerQuoteExcerptId: string | null;
  successMeasure: string | null;
  state: "draft" | "agreed";
}

export interface PrfaqPromise {
  id: string;
  prfaqId: string;
  text: string;
}

export interface FaqEntry {
  id: string;
  prfaqId: string;
  audience: "customer" | "internal";
  question: string;
  answer: string | null;
  storyIds: string[];
  blocking: boolean;
}

export type ReadBackAssessment = "pending" | "matches" | "diverges" | "too_close";

export interface ReadBack {
  id: string;
  epicId: string;
  personId: string;
  text: string;
  assessment: ReadBackAssessment;
  note: string | null;
  createdAt: Date;
}

export interface Session {
  id: string;
  date: Date;
  lengthMinutes: number;
  attendeeIds: string[];
  agenda: string[];
  status: "planned" | "live" | "ended";
  captureText: string;
}

/** Everything the domain functions read. Built from the database or straight from seed.json. */
export interface DomainSnapshot {
  people: Person[];
  templates: Template[];
  epics: Epic[];
  stories: Story[];
  blocks: Block[];
  items: Item[];
  stances: Stance[];
  sources: Source[];
  excerpts: Excerpt[];
  citations: Citation[];
  drafts: Draft[];
  hatNotes: HatNote[];
  criteria: Criterion[];
  prfaqs: Prfaq[];
  promises: PrfaqPromise[];
  faqEntries: FaqEntry[];
  readBacks: ReadBack[];
  sessions: Session[];
}

export type FixTargetType =
  | "story"
  | "epic"
  | "block"
  | "item"
  | "criterion"
  | "hatNote"
  | "prfaq"
  | "promise"
  | "faq"
  | "readBack"
  | "person";

export interface FixTarget {
  type: FixTargetType;
  id: string;
}

export type CheckScope = "right_thing" | "built_right" | "prfaq_agreement";
export type CheckTier = "floor" | "team";

/** One specific thing that makes a check fail. */
export interface Blocker {
  reason: string;
  fixTarget: FixTarget;
  /** The person this blocker waits on, when the check itself names one (a missing stance or read-back). */
  personId?: string;
}

export interface CheckResult {
  key: string;
  scope: CheckScope;
  tier: CheckTier;
  label: string;
  passed: boolean;
  reason: string;
  /** The first thing to fix. Null when the check passes. */
  fixTarget: FixTarget | null;
  blockers: Blocker[];
}
