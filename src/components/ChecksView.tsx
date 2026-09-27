"use client";
// The two meters under the title, and the checks view they open (V6Checks). Everything shown is
// computed by src/domain/checks-view.ts; this only displays it. Signing off goes through the
// lifecycle's guarded signOff (ADR-007).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOffActionUI } from "@/app/actions";
import type { CheckLine, ChecksView as View } from "@/domain/checks-view";
import { scrollToAnchor } from "./scroll";

function Meter({ name, passed, total, open, onToggle }: { name: string; passed: number; total: number; open: boolean; onToggle: () => void }) {
  const ok = passed === total;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls="checks-view"
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

function Line({ l }: { l: CheckLine }) {
  const text = (
    <>
      {l.label}
      {l.detail && <span className="text-muted"> · {l.detail}</span>}
    </>
  );
  return (
    <li data-testid={`check-${l.key}`} className="flex items-baseline gap-2 py-1">
      <span aria-label={l.passed ? "passes" : "fails"} className={`w-3 shrink-0 font-mono ${l.passed ? "text-agreed" : "text-alert"}`}>
        {l.passed ? "✓" : "✗"}
      </span>
      <span className="flex-1">
        {l.link?.kind === "anchor" ? (
          <a
            href={`#${l.link.anchor}`}
            className="text-alert underline-offset-2 hover:underline"
            onClick={(e) => {
              e.preventDefault();
              scrollToAnchor(l.link && l.link.kind === "anchor" ? l.link.anchor : null);
            }}
          >
            {text}
          </a>
        ) : l.link?.kind === "href" ? (
          <Link href={l.link.href} className="text-alert underline-offset-2 hover:underline" title={l.link.label}>
            {text}
          </Link>
        ) : (
          text
        )}
        <span className="block text-xs text-muted">{l.reason}</span>
      </span>
      <span className={`font-mono text-[10px] uppercase ${l.tier === "floor" ? "text-ink" : "text-muted"}`}>{l.tier}</span>
    </li>
  );
}

export function ChecksView({ storyId, view }: { storyId: string; view: View }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <Meter name="Right thing" passed={view.rightThing.passed} total={view.rightThing.total} open={open} onToggle={() => setOpen((o) => !o)} />
        <Meter name="Built right" passed={view.builtRight.passed} total={view.builtRight.total} open={open} onToggle={() => setOpen((o) => !o)} />
        <span className="text-sm text-muted">Both must pass before this goes to Jira as Ready.</span>
      </div>
      {view.drift.length > 0 && (
        <p data-testid="drift" role="status" className="mt-2 rounded border border-alert bg-alert-bg px-3 py-2 text-sm">
          Signed off as Ready, but these checks fail now: {view.drift.join(", ")}. Editing the story reopens it.
        </p>
      )}
      {open && (
        <section id="checks-view" data-testid="checks-view" aria-label="Checks" className="mt-3 rounded border border-hairline bg-panel p-4 text-sm">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-serif text-lg">
                Right thing <span className="text-muted">{view.rightThing.passed} of {view.rightThing.total}</span>
              </h3>
              <p className="text-xs text-muted">Anchored to the epic&apos;s PRFAQ. Stories inherit the epic&apos;s checks and add their own trace.</p>
              <ul className="mt-2">{view.rightThing.lines.map((l) => <Line key={l.key} l={l} />)}</ul>
            </div>
            <div>
              <h3 className="font-serif text-lg">
                Built right <span className="text-muted">{view.builtRight.passed} of {view.builtRight.total}</span>
              </h3>
              <p className="text-xs text-muted">Your Definition of Ready. Floor checks can&apos;t be removed; team checks are yours.</p>
              <ul className="mt-2">{view.builtRight.lines.map((l) => <Line key={l.key} l={l} />)}</ul>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
            <span className="font-mono text-xs uppercase tracking-wide text-muted">Right thing + Built right → Lead signs off → Ready in Jira</span>
            <button
              type="button"
              data-testid="sign-off"
              disabled={pending || !view.signOff.enabled}
              aria-describedby="sign-off-why"
              onClick={() =>
                start(async () => {
                  const r = await signOffActionUI(storyId);
                  if (r.status === "refused") setMessage(r.reason);
                  else router.refresh();
                })
              }
              className="ml-auto rounded bg-ink px-3 py-1 text-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sign off as Ready
            </button>
          </div>
          {(view.signOff.reasons.length > 0 || message) && (
            <p id="sign-off-why" data-testid="sign-off-why" className="mt-1 text-right text-xs text-muted">
              {message ?? view.signOff.reasons.join(" · ")}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
