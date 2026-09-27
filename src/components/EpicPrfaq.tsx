"use client";
// The epic centre (V6Epic): the PRFAQ, editable by its owner. The customer quote is chosen from
// real excerpts, never typed. Any edit to an agreed PRFAQ sends it back to draft (ADR-034).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveFaqUI, savePrfaqFieldsUI, savePromiseUI, setQuoteUI } from "@/app/actions";
import type { PrfaqView } from "@/domain/prfaq";
import type { ActionResult } from "@/server/triage";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>, onDone?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.status === "refused") setMessage(r.reason);
      else {
        setMessage(null);
        onDone?.();
        router.refresh();
      }
    });
  return { pending, message, run };
}

function EditButton({ canEdit, reason, onClick, label = "Edit" }: { canEdit: boolean; reason: string | null; onClick: () => void; label?: string }) {
  if (!canEdit) return null;
  return (
    <button type="button" onClick={onClick} title={reason ?? undefined} className="ml-2 font-mono text-[11px] uppercase text-agreed hover:underline">
      {label}
    </button>
  );
}

function Field({ epicId, field, label, value, canEdit, big }: { epicId: string; field: "headline" | "subhead" | "problem" | "whatChanges" | "successMeasure"; label: string | null; value: string | null; canEdit: boolean; big?: "h1" | "sub" }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  const { pending, message, run } = useAction();
  return (
    <section data-testid={`prfaq-${field}`} className={big ? "" : "mt-6"}>
      {label && (
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          {label}
          <EditButton canEdit={canEdit && !editing} reason={null} onClick={() => setEditing(true)} />
        </h2>
      )}
      {editing ? (
        <form
          className="mt-1 flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => savePrfaqFieldsUI(epicId, { [field]: text }), () => setEditing(false));
          }}
        >
          <label className="sr-only" htmlFor={`f-${field}`}>
            {label ?? field}
          </label>
          <textarea id={`f-${field}`} value={text} onChange={(e) => setText(e.target.value)} rows={big ? 2 : 3} className="rounded border border-line px-2 py-1" />
          <div className="flex gap-2 text-sm">
            <button type="submit" disabled={pending} className="rounded bg-ink px-2 py-0.5 text-paper">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded border border-line px-2 py-0.5">
              Cancel
            </button>
          </div>
          {message && <p className="text-xs text-alert">{message}</p>}
        </form>
      ) : big === "h1" ? (
        <div className="mt-3 flex items-baseline gap-1">
          <h1 className="font-serif text-3xl font-medium">{value}</h1>
          <EditButton canEdit={canEdit} reason={null} onClick={() => setEditing(true)} label="Edit headline" />
        </div>
      ) : big === "sub" ? (
        <div className="mt-2 flex items-baseline gap-1">
          <p className="text-lg text-muted">{value}</p>
          <EditButton canEdit={canEdit} reason={null} onClick={() => setEditing(true)} label="Edit subhead" />
        </div>
      ) : (
        <p className="mt-1">{value ?? <span className="text-alert">Not written yet.</span>}</p>
      )}
    </section>
  );
}

type Faq = PrfaqView["faqs"][number];

function FaqEntry({ epicId, faq, stories, canEdit }: { epicId: string; faq: Faq | null; stories: PrfaqView["epicStories"]; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const { pending, message, run } = useAction();
  if (!faq && !editing) return null;
  const blockingOpen = faq?.blocking && !faq.answer;
  return (
    <div data-testid={faq ? `faq-${faq.id}` : "faq-new"} className={blockingOpen ? "rounded border border-alert bg-alert-bg px-3 py-2" : ""}>
      {editing ? (
        <form
          className="flex flex-col gap-1 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () =>
                saveFaqUI(epicId, {
                  id: faq?.id ?? null,
                  audience: (f.get("audience") as "customer" | "internal") ?? "customer",
                  question: String(f.get("question") ?? ""),
                  answer: String(f.get("answer") ?? "") || null,
                  storyIds: f.getAll("story").map(String),
                  blocking: f.get("blocking") === "on",
                }),
              () => setEditing(false),
            );
          }}
        >
          <input type="hidden" name="audience" value={faq?.audience ?? "customer"} />
          <label className="text-muted">
            Question
            <input name="question" defaultValue={faq?.question ?? ""} className="mt-0.5 block w-full rounded border border-line px-2 py-1 text-ink" />
          </label>
          <label className="text-muted">
            Answer
            <textarea name="answer" defaultValue={faq?.answer ?? ""} rows={2} className="mt-0.5 block w-full rounded border border-line px-2 py-1 text-ink" />
          </label>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="text-muted">Delivered by</legend>
            {stories.map((s) => (
              <label key={s.id} className="flex items-center gap-1 font-mono text-xs">
                <input type="checkbox" name="story" value={s.id} defaultChecked={faq?.storyIds.includes(s.id)} /> {s.key}
              </label>
            ))}
          </fieldset>
          {faq?.audience === "internal" && (
            <label className="flex items-center gap-1">
              <input type="checkbox" name="blocking" defaultChecked={faq.blocking} /> Blocks agreement until answered
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="rounded bg-ink px-2 py-0.5 text-paper">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded border border-line px-2 py-0.5">
              Cancel
            </button>
          </div>
          {message && <p className="text-xs text-alert">{message}</p>}
        </form>
      ) : (
        faq && (
          <>
            <dt className="font-medium">
              {faq.question}
              <EditButton canEdit={canEdit} reason={null} onClick={() => setEditing(true)} />
            </dt>
            <dd className="text-muted">
              {faq.answer ?? (faq.blocking ? "No answer yet. This blocks alignment." : "Open.")}
              {faq.stories.map((s) => (
                <Link key={s.id} href={`/w/${s.key}`} data-testid={`faq-link-${s.key}`} className="ml-2 font-mono text-xs">
                  → {s.key}
                  {s.open && <span className="ml-1 text-muted">open</span>}
                </Link>
              ))}
              {faq.evidence && <span className="block text-xs">Evidence: {faq.evidence}</span>}
            </dd>
          </>
        )
      )}
    </div>
  );
}

export function EpicPrfaq({ epicId, view }: { epicId: string; view: PrfaqView }) {
  const canEdit = view.editReason === null;
  const [choosing, setChoosing] = useState(false);
  const [quoteId, setQuoteId] = useState(view.prfaq?.customerQuoteExcerptId ?? "");
  const [newPromise, setNewPromise] = useState<string | null>(null);
  const quoteAction = useAction();
  const promiseAction = useAction();
  const p = view.prfaq;
  if (!p) return <p className="mt-6 text-muted">This epic has no PRFAQ yet.</p>;
  return (
    <article data-testid="prfaq" className="max-w-3xl">
      {!canEdit && <p className="mt-2 text-xs text-muted">{view.editReason}. You can write your read-back on the right.</p>}
      <Field epicId={epicId} field="headline" label={null} value={p.headline} canEdit={canEdit} big="h1" />
      <Field epicId={epicId} field="subhead" label={null} value={p.subhead} canEdit={canEdit} big="sub" />
      <Field epicId={epicId} field="problem" label="The problem" value={p.problem} canEdit={canEdit} />
      <Field epicId={epicId} field="whatChanges" label="What changes" value={p.whatChanges} canEdit={canEdit} />

      <figure data-testid="prfaq-quote" className="mt-6 border-l-2 border-agreed pl-4">
        {view.quote ? (
          <>
            <blockquote className="font-serif text-xl">&ldquo;{view.quote.text}&rdquo;</blockquote>
            <figcaption className="mt-1 font-mono text-xs text-muted">
              {view.quote.source}, {view.quote.locator} · a real quote, not written by us
            </figcaption>
          </>
        ) : (
          <p className="text-alert">No customer quote chosen yet.</p>
        )}
        {canEdit && !choosing && (
          <button type="button" onClick={() => setChoosing(true)} className="mt-1 font-mono text-[11px] uppercase text-agreed hover:underline">
            Choose a different excerpt
          </button>
        )}
        {choosing && (
          <div className="mt-2 flex flex-col gap-1 text-sm">
            <label htmlFor="quote-choice" className="text-muted">
              Quotes from sources
            </label>
            <select id="quote-choice" value={quoteId} onChange={(e) => setQuoteId(e.target.value)} className="rounded border border-line px-2 py-1">
              {view.quoteOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="button" disabled={quoteAction.pending} onClick={() => quoteAction.run(() => setQuoteUI(epicId, quoteId), () => setChoosing(false))} className="rounded bg-ink px-2 py-0.5 text-paper">
                Use this quote
              </button>
              <button type="button" onClick={() => setChoosing(false)} className="rounded border border-line px-2 py-0.5">
                Cancel
              </button>
            </div>
            {quoteAction.message && <p className="text-xs text-alert">{quoteAction.message}</p>}
          </div>
        )}
      </figure>

      <Field epicId={epicId} field="successMeasure" label="How we'll know it worked" value={p.successMeasure} canEdit={canEdit} />

      <section data-testid="prfaq-promises" className="mt-6">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          Promises
          <EditButton canEdit={canEdit && newPromise === null} reason={null} onClick={() => setNewPromise("")} label="Add a promise" />
        </h2>
        <ul className="mt-1 list-disc pl-5">
          {view.promises.map((pr) => (
            <li key={pr.id}>{pr.text}</li>
          ))}
        </ul>
        {newPromise !== null && (
          <form
            className="mt-1 flex gap-2 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              promiseAction.run(() => savePromiseUI(epicId, null, newPromise), () => setNewPromise(null));
            }}
          >
            <label className="sr-only" htmlFor="new-promise">
              New promise
            </label>
            <input id="new-promise" value={newPromise} onChange={(e) => setNewPromise(e.target.value)} className="flex-1 rounded border border-line px-2 py-1" />
            <button type="submit" className="rounded bg-ink px-2 py-0.5 text-paper">
              Add
            </button>
          </form>
        )}
      </section>

      {(["customer", "internal"] as const).map((audience) => (
        <section key={audience} data-testid={`prfaq-faq-${audience}`}>
          <h2 className="mt-6 font-mono text-xs uppercase tracking-wide text-muted">{audience === "customer" ? "Customer FAQ" : "Internal FAQ"}</h2>
          <dl className="mt-2 space-y-3">
            {view.faqs
              .filter((f) => f.audience === audience)
              .map((f) => (
                <FaqEntry key={f.id} epicId={epicId} faq={f} stories={view.epicStories} canEdit={canEdit} />
              ))}
          </dl>
        </section>
      ))}
    </article>
  );
}
