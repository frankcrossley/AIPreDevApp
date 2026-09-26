"use client";
// Right column for a story: For this item · Details · Activity. Bolt 3 adds the Scrum Master
// summary, drafts, hat notes and discovery to "For this item".
import { useState } from "react";
import type { PanelCard, PanelSections } from "@/domain/panel";
import { CHIP_LABELS } from "./notebook/line";
import { scrollToAnchor } from "./scroll";

interface Props {
  panel: PanelSections;
  details: [string, string][];
  activity: { id: string; who: string; what: string; when: string; payload: string }[];
  actorId: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  "block.created": "added a line",
  "block.edited": "edited a line",
  "block.deleted": "removed a line",
  "item.created": "added an item",
  "item.edited": "edited an item",
  "item.archived": "turned an item back into plain text",
  "item.restored": "restored an item",
  "item.marked_blocking": "marked a question blocking",
  "item.unmarked_blocking": "marked a question not blocking",
  "story.reopened": "reopened agreed content",
  "story.signed_off": "signed off as Ready",
  "story.created": "created the story",
  "story.transition": "moved the story",
};

function Card({ card }: { card: PanelCard }) {
  return (
    <li data-testid={`card-${card.itemId}`}>
      <button
        type="button"
        onClick={() => scrollToAnchor(card.blockId ? `block-${card.blockId}` : null)}
        className={`w-full rounded border px-3 py-2 text-left ${card.blocking ? "border-alert" : "border-dashed border-line"}`}
      >
        <span className={`font-mono text-[11px] uppercase tracking-wide ${card.blocking ? "text-alert" : "text-muted"}`}>
          {card.blocking ? "Blocking" : CHIP_LABELS[card.type] ?? card.type}
        </span>
        <span className="block">{card.text}</span>
        <span className="block text-xs text-muted">{card.detail}</span>
      </button>
    </li>
  );
}

function Group({ title, cards, testId }: { title: string; cards: PanelCard[]; testId: string }) {
  return (
    <section data-testid={testId} className="mt-4">
      <h3 className="font-mono text-xs uppercase tracking-wide text-muted">
        {title} · {cards.length}
      </h3>
      {cards.length ? <ul className="mt-2 space-y-2">{cards.map((c) => <Card key={c.itemId} card={c} />)}</ul> : <p className="mt-1 text-sm text-muted">Nothing here.</p>}
    </section>
  );
}

export function RightPanel({ panel, details, activity }: Props) {
  const tabs = [`For this item · ${panel.count}`, "Details", "Activity"];
  const [tab, setTab] = useState(0);
  return (
    <aside data-testid="right-panel" className="overflow-y-auto border-l border-hairline bg-panel px-4 py-3 text-sm">
      <div role="tablist" aria-label="Context" className="flex gap-4 border-b border-hairline">
        {tabs.map((t, i) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === i}
            onClick={() => setTab(i)}
            className={`-mb-px border-b-2 pb-2 ${tab === i ? "border-ink font-medium" : "border-transparent text-muted"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 0 && (
        <div role="tabpanel">
          <Group title="Decisions needed" cards={panel.decisionsNeeded} testId="decisions-needed" />
          <Group title="Talking points" cards={panel.talkingPoints} testId="talking-points" />
        </div>
      )}
      {tab === 1 && (
        <dl role="tabpanel" className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {details.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {tab === 2 && (
        <ol role="tabpanel" data-testid="activity" className="mt-4 space-y-2">
          {activity.length === 0 && <li className="text-muted">No activity yet.</li>}
          {activity.map((a) => (
            <li key={a.id}>
              <span className="font-medium">{a.who}</span> {ACTIVITY_LABELS[a.what] ?? a.what}
              <span className="block font-mono text-[11px] text-muted">{new Date(a.when).toLocaleString("en-GB")}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
