"use client";
// Right column for an epic: Alignment · For this epic · Details. Opens on Alignment.
// Agreement is measured with read-backs, not assumed (05-prfaq-alignment).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addPromiseForStoryUI, agreePrfaqUI, dropStoryUI, moveStoryToOwnEpicUI, putToSessionActionUI, writeReadBackUI } from "@/app/actions";
import type { PanelCard } from "@/domain/panel";
import type { PrfaqView } from "@/domain/prfaq";
import type { ActionResult } from "@/server/triage";
import { Card } from "./RightPanel";

const ASSESSMENT: Record<string, string> = { matches: "Matches", diverges: "Diverges", too_close: "Too close to the page", pending: "Read it again" };

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>, onDone?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.status === "refused") setMessage(r.reason);
      else if (r.status === "needs_confirmation") setMessage(r.warning);
      else {
        setMessage(r.message ?? null);
        onDone?.();
        router.refresh();
      }
    });
  return { pending, message, run };
}

interface Session {
  id: string;
  label: string;
  agenda: string[];
}

function ReadBackPrompt({ epicId, existing }: { epicId: string; existing: string | null }) {
  const [text, setText] = useState(existing ?? "");
  const [open, setOpen] = useState(existing === null);
  const { pending, message, run } = useAction();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs text-agreed hover:underline">
        Rewrite your read-back
      </button>
    );
  }
  return (
    <form
      data-testid="readback-prompt"
      className="mt-3 rounded border border-dashed border-line px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => writeReadBackUI(epicId, text), () => setOpen(false));
      }}
    >
      <label htmlFor="readback" className="block font-medium">
        What are we building, and why? One line, in your own words.
      </label>
      <textarea id="readback" value={text} onChange={(e) => setText(e.target.value)} rows={2} className="mt-1 w-full rounded border border-line px-2 py-1" />
      <button type="submit" disabled={pending} className="mt-1 rounded bg-ink px-2 py-0.5 text-paper">
        Save read-back
      </button>
      {message && <p className="mt-1 text-xs text-alert">{message}</p>}
    </form>
  );
}

function ReadBackCard({ r, epicId, session }: { r: PrfaqView["readBacks"][number]; epicId: string; session: Session | null }) {
  const { pending, message, run } = useAction();
  const onAgenda = !!(session && r.talkItThrough && session.agenda.includes(r.talkItThrough));
  // A stand-in "matches" isn't a real assessment yet, so it's drawn dashed (ADR-035).
  const tone = r.assessment === "matches" ? (r.standIn ? "border-dashed border-agreed" : "border-agreed") : r.assessment === "pending" ? "border-dashed border-line" : r.assessment ? "border-alert" : "border-dashed border-line";
  return (
    <li data-testid={`readback-${r.personId}`} className={`rounded border px-3 py-2 ${tone}`}>
      <span className="font-medium">{r.name}</span>
      <span className={`ml-2 font-mono text-[11px] uppercase ${r.assessment === "matches" ? "text-agreed" : "text-alert"}`}>
        {r.assessment ? ASSESSMENT[r.assessment] : "Not written yet"}
        {r.standIn && " · stand-in"}
      </span>
      {r.text && <span className="block">{r.text}</span>}
      {r.note && <span className="block text-xs text-muted">{r.note}</span>}
      {r.talkItThrough && session && (
        <button
          type="button"
          disabled={pending || onAgenda}
          onClick={() => run(() => putToSessionActionUI(session.id, r.talkItThrough!, epicId))}
          className="mt-1 text-xs text-agreed hover:underline disabled:text-muted disabled:no-underline"
        >
          {onAgenda ? `On the ${session.label} agenda` : "Talk it through"}
        </button>
      )}
      {message && <span className="block text-xs text-muted">{message}</span>}
    </li>
  );
}

function Unpromised({ s, epicId }: { s: PrfaqView["unpromised"][number]; epicId: string }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const { pending, message, run } = useAction();
  return (
    <li data-testid={`unpromised-${s.key}`} className="rounded border border-dashed border-alert px-3 py-2">
      <span className="font-mono text-xs">{s.key}</span> {s.title}
      <span className="block text-xs text-alert">serves no promise in this PRFAQ.</span>
      <span className="mt-1 flex flex-wrap gap-3 text-xs">
        <button type="button" disabled={pending || s.addReason !== null} title={s.addReason ?? undefined} onClick={() => setAdding(true)} className="text-agreed hover:underline disabled:text-muted">
          Add a promise
        </button>
        <button type="button" disabled={pending || s.moveReason !== null} title={s.moveReason ?? undefined} onClick={() => run(() => moveStoryToOwnEpicUI(epicId, s.id))} className="text-agreed hover:underline disabled:text-muted">
          Move to its own epic
        </button>
        <button type="button" disabled={pending || s.dropReason !== null} title={s.dropReason ?? undefined} onClick={() => run(() => dropStoryUI(epicId, s.id))} className="text-agreed hover:underline disabled:text-muted">
          Drop it
        </button>
      </span>
      {(s.addReason ?? s.dropReason) && <span className="block text-xs text-muted">{s.addReason ?? s.dropReason}</span>}
      {adding && (
        <form
          className="mt-2 flex gap-2 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addPromiseForStoryUI(epicId, s.id, text), () => setAdding(false));
          }}
        >
          <label className="sr-only" htmlFor={`promise-${s.id}`}>
            The promise {s.key} serves
          </label>
          <input id={`promise-${s.id}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="The customer promise it serves" className="flex-1 rounded border border-line px-2 py-1" />
          <button type="submit" className="rounded bg-ink px-2 py-0.5 text-paper">
            Add
          </button>
        </form>
      )}
      {message && <span className="block text-xs text-muted">{message}</span>}
    </li>
  );
}

export function EpicPanel({ epicId, view, details, cards, session }: { epicId: string; view: PrfaqView; details: [string, string][]; cards: PanelCard[]; session: Session | null }) {
  const tabs = ["Alignment", `For this epic · ${cards.length}`, "Details"];
  const [tab, setTab] = useState(0);
  const agree = useAction();
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
          <p className="text-xs text-muted">Everyone on the team writes one line in their own words. Agreeing with the page isn&apos;t enough.</p>
          {view.prompt && <ReadBackPrompt epicId={epicId} existing={view.prompt.existing} />}
          <ul className="mt-2 space-y-2">
            {view.readBacks.map((r) => (
              <ReadBackCard key={r.personId} r={r} epicId={epicId} session={session} />
            ))}
          </ul>

          <h3 className="mt-4 font-mono text-xs uppercase tracking-wide text-muted">Promises and stories</h3>
          <ul className="mt-2 space-y-1">
            {view.promises.map((p) => (
              <li key={p.id}>
                &ldquo;{p.text}&rdquo;{" "}
                <span className={`font-mono text-xs ${p.stories.length ? "text-muted" : "text-alert"}`}>{p.stories.map((s) => s.key).join(", ") || "no story yet"}</span>
              </li>
            ))}
          </ul>
          {view.unpromised.length > 0 && (
            <ul data-testid="serves-no-promise" className="mt-2 space-y-2">
              {view.unpromised.map((s) => (
                <Unpromised key={s.id} s={s} epicId={epicId} />
              ))}
            </ul>
          )}

          {view.evidenceAgainst.length > 0 && (
            <>
              <h3 className="mt-4 font-mono text-xs uppercase tracking-wide text-muted">Evidence against</h3>
              <ul data-testid="evidence-against" className="mt-2 space-y-1">
                {view.evidenceAgainst.map((e) => (
                  <li key={e.faqId} className={e.answered ? "text-muted" : "text-alert"}>
                    {e.text}. {e.answered ? "The internal FAQ answers it." : "The internal FAQ has to answer it before this can be agreed."}
                  </li>
                ))}
              </ul>
            </>
          )}

          <button
            type="button"
            data-testid="agree-prfaq"
            disabled={agree.pending || !view.agree.enabled}
            onClick={() => agree.run(() => agreePrfaqUI(epicId))}
            aria-describedby="agree-reason"
            className="mt-6 w-full rounded bg-ink px-3 py-2 text-paper disabled:cursor-not-allowed disabled:opacity-40"
          >
            {view.state === "agreed" ? "PRFAQ agreed" : "Agree the PRFAQ"}
          </button>
          <ul id="agree-reason" data-testid="agree-reasons" className="mt-2 space-y-1 text-xs text-muted">
            {view.state !== "agreed" && view.agree.reasons.map((b) => <li key={b}>{b}</li>)}
            {view.state === "agreed" && <li>Agreed. Editing the PRFAQ sends it back for agreement.</li>}
          </ul>
          {agree.message && <p className="text-xs text-alert">{agree.message}</p>}
        </div>
      )}
      {tab === 1 && (
        <div role="tabpanel">
          {cards.length === 0 && <p className="mt-4 text-muted">Nothing waiting on the epic.</p>}
          <ul className="mt-4 space-y-2">
            {cards.map((c) => (
              <Card key={c.id} card={c} storyId={epicId} />
            ))}
          </ul>
        </div>
      )}
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
