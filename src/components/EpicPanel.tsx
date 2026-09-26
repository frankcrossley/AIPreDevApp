"use client";
// Right column for an epic: Alignment · For this epic · Details. Opens on Alignment.
import { useState } from "react";

interface Alignment {
  readBacks: { personId: string; name: string; text: string | null; assessment: string | null; note: string | null }[];
  promises: { id: string; text: string; stories: string[] }[];
  unpromised: { key: string; title: string }[];
  blockers: string[];
}

const ASSESSMENT: Record<string, string> = { matches: "Matches", diverges: "Diverges", too_close: "Repeats the PRFAQ", pending: "Not assessed" };

export function EpicPanel({ alignment, details }: { alignment: Alignment; details: [string, string][] }) {
  const tabs = ["Alignment", "For this epic", "Details"];
  const [tab, setTab] = useState(0);
  return (
    <aside data-testid="right-panel" className="overflow-y-auto border-l border-hairline bg-panel px-4 py-3 text-sm">
      <div role="tablist" aria-label="Context" className="flex gap-4 border-b border-hairline">
        {tabs.map((t, i) => (
          <button key={t} role="tab" type="button" aria-selected={tab === i} onClick={() => setTab(i)} className={`-mb-px border-b-2 pb-2 ${tab === i ? "border-ink font-medium" : "border-transparent text-muted"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 0 && (
        <div role="tabpanel">
          <h3 className="mt-4 font-mono text-xs uppercase tracking-wide text-muted">Read-backs · what are we building, and why?</h3>
          <ul className="mt-2 space-y-2">
            {alignment.readBacks.map((r) => (
              <li key={r.personId} data-testid={`readback-${r.personId}`} className={`rounded border px-3 py-2 ${r.assessment === "matches" ? "border-agreed" : r.assessment ? "border-alert" : "border-dashed border-line"}`}>
                <span className="font-medium">{r.name}</span>
                <span className={`ml-2 font-mono text-[11px] uppercase ${r.assessment === "matches" ? "text-agreed" : "text-alert"}`}>
                  {r.assessment ? ASSESSMENT[r.assessment] : "Not written yet"}
                </span>
                {r.text && <span className="block">{r.text}</span>}
                {r.note && <span className="block text-xs text-muted">{r.note}</span>}
              </li>
            ))}
          </ul>
          <h3 className="mt-4 font-mono text-xs uppercase tracking-wide text-muted">Promises and stories</h3>
          <ul className="mt-2 space-y-1">
            {alignment.promises.map((p) => (
              <li key={p.id}>
                &ldquo;{p.text}&rdquo; <span className="font-mono text-xs text-muted">{p.stories.join(", ") || "no story yet"}</span>
              </li>
            ))}
            {alignment.unpromised.map((s) => (
              <li key={s.key} className="text-alert">
                {s.key} {s.title} serves no promise in this PRFAQ.
              </li>
            ))}
          </ul>
          <button type="button" disabled className="mt-6 w-full rounded bg-ink px-3 py-2 text-paper opacity-50" aria-describedby="agree-reason">
            Agree the PRFAQ
          </button>
          <ul id="agree-reason" className="mt-2 space-y-1 text-xs text-muted">
            {alignment.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
            {alignment.blockers.length === 0 && <li>Agreeing arrives in a later build.</li>}
          </ul>
        </div>
      )}
      {tab === 1 && <p role="tabpanel" className="mt-4 text-muted">Drafts and talking points for the epic arrive with the right panel build.</p>}
      {tab === 2 && (
        <dl role="tabpanel" className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {details.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}
