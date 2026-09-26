"use client";
// The two meters under the title. Results are computed on the server (ADR-007); clicking a
// meter lists its checks, and each failing line links to its fix. The full checks view is bolt 4.
import { useState } from "react";
import { scrollToAnchor } from "./scroll";

export interface MeterLine {
  key: string;
  label: string;
  tier: string;
  passed: boolean;
  reason: string;
  anchor: string | null;
}

interface MeterData {
  meter: { passed: number; total: number };
  lines: MeterLine[];
}

function Meter({ name, data, open, onToggle }: { name: string; data: MeterData; open: boolean; onToggle: () => void }) {
  const { passed, total } = data.meter;
  const ok = passed === total;
  return (
    <button
      type="button"
      aria-expanded={open}
      data-testid={`meter-${name}`}
      onClick={onToggle}
      className={`rounded border px-3 py-2 text-left ${ok ? "border-agreed bg-agreed-bg" : "border-line bg-panel"}`}
    >
      <span className="block font-mono text-[11px] uppercase tracking-wide text-muted">{name}</span>
      <span data-testid="meter-count" className={`font-serif text-xl ${ok ? "text-agreed" : "text-ink"}`}>
        {passed} of {total}
      </span>
    </button>
  );
}

export function Meters({ rightThing, builtRight }: { rightThing: MeterData; builtRight: MeterData }) {
  const [open, setOpen] = useState<"Right thing" | "Built right" | null>(null);
  const lines = open === "Right thing" ? rightThing.lines : open === "Built right" ? builtRight.lines : [];
  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <Meter name="Right thing" data={rightThing} open={open === "Right thing"} onToggle={() => setOpen(open === "Right thing" ? null : "Right thing")} />
        <Meter name="Built right" data={builtRight} open={open === "Built right"} onToggle={() => setOpen(open === "Built right" ? null : "Built right")} />
        <span className="text-sm text-muted">Both must pass before this goes to Jira as Ready.</span>
      </div>
      {open && (
        <ul data-testid="check-list" className="mt-3 divide-y divide-hairline rounded border border-hairline bg-panel text-sm">
          {lines.map((l) => (
            <li key={l.key} data-testid={`check-${l.key}`} className="flex items-baseline gap-2 px-3 py-2">
              <span className={`font-mono text-[11px] uppercase ${l.passed ? "text-agreed" : "text-alert"}`}>{l.passed ? "Pass" : "Fail"}</span>
              <span className="font-medium">{l.label}</span>
              <span className="font-mono text-[10px] uppercase text-muted">{l.tier}</span>
              {!l.passed && l.anchor ? (
                <a
                  href={`#${l.anchor}`}
                  className="ml-auto text-right"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToAnchor(l.anchor);
                  }}
                >
                  {l.reason}
                </a>
              ) : (
                <span className="ml-auto text-right text-muted">{l.reason}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
