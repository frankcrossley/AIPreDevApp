"use client";
// Right column for a story (03-right-panel): For this item · Details · Activity.
// Everything shown is computed by src/domain/panel.ts; this component only displays it and
// sends the actions. Disabled actions say why.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acceptDraftActionUI,
  answerHatNoteActionUI,
  dismissHatNoteActionUI,
  mergeDraftActionUI,
  moveDraftActionUI,
  putToSessionActionUI,
  rejectDraftActionUI,
  restoreDraftActionUI,
  withdrawSuggestionActionUI,
} from "@/app/actions";
import type { CardAction, ForThisItem, PanelCard } from "@/domain/panel";
import type { ActionResult } from "@/server/triage";
import { scrollToAnchor } from "./scroll";

export interface ExpiredDraftView {
  id: string;
  text: string;
  author: string;
  restoreReason: string | null;
}

interface Props {
  storyId: string;
  panel: ForThisItem;
  details: [string, string][];
  activity: { id: string; who: string; what: string; when: string }[];
  expired: ExpiredDraftView[];
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
  "draft.accepted": "accepted a draft",
  "draft.merged": "merged a draft",
  "draft.rejected": "rejected a draft",
  "draft.moved": "moved a draft to another item",
  "draft.moved_in": "moved a draft here",
  "draft.restored": "restored an expired draft",
  "draft.expired": "A draft expired",
  "suggestion.updated": "suggested a change",
  "suggestion.withdrawn": "withdrew a suggestion",
  "hat_note.answered": "answered a hat note",
  "hat_note.dismissed": "dismissed a hat note",
  "session.agenda_added": "put something to the next session",
};

const TONE: Record<PanelCard["tone"], string> = {
  alert: "border-alert",
  dashed: "border-dashed border-line",
  solid: "border-agreed",
};

export function Card({ card, storyId }: { card: PanelCard; storyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ warning: string; retry: () => void } | null>(null);
  const [writing, setWriting] = useState<null | "answer" | "add_to_page">(null);
  const [text, setText] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeInto, setMergeInto] = useState("");

  // Runs an action; if it needs confirming, keeps a retry that confirms.
  const run = (fn: (confirmReopen: boolean) => Promise<ActionResult>, confirmReopen = false) =>
    start(async () => {
      const r = await fn(confirmReopen);
      if (r.status === "refused") setMessage(r.reason);
      else if (r.status === "needs_confirmation") setConfirm({ warning: r.warning, retry: () => run(fn, true) });
      else {
        setMessage(r.message ?? null);
        setConfirm(null);
        setWriting(null);
        setMerging(false);
        router.refresh();
      }
    });

  const onAction = (a: CardAction) => {
    setMessage(null);
    switch (a.kind) {
      case "decide":
        return scrollToAnchor(card.anchor);
      case "put_to_session":
        return run(() => putToSessionActionUI(a.targetId!, card.id, storyId));
      case "answer":
      case "add_to_page":
        setText(a.kind === "add_to_page" ? card.title : "");
        return setWriting(a.kind);
      case "dismiss":
        return run(() => dismissHatNoteActionUI(card.id));
      case "accept":
        return run((c) => acceptDraftActionUI(card.id, c));
      case "merge":
        return setMerging((m) => !m);
      case "reject":
        return run(() => rejectDraftActionUI(card.id));
      case "move":
        return run(() => moveDraftActionUI(card.id, a.targetId!));
      case "withdraw":
        return run(() => withdrawSuggestionActionUI(card.id));
    }
  };

  const reasons = [...new Set(card.actions.map((a) => a.disabledReason).filter(Boolean))];
  return (
    <li data-testid={`card-${card.id}`} className={`rounded border px-3 py-2 ${TONE[card.tone]}`}>
      <button type="button" className="w-full text-left" onClick={() => scrollToAnchor(card.anchor)}>
        <span className={`font-mono text-[11px] uppercase tracking-wide ${card.tone === "alert" ? "text-alert" : card.tone === "solid" ? "text-agreed" : "text-muted"}`}>{card.tag}</span>
        <span className="block">{card.title}</span>
        <span data-testid="card-detail" className="block text-xs text-muted">
          {card.detail}
        </span>
      </button>
      {card.actions.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
          {card.actions.map((a) => (
            <button
              key={a.kind}
              type="button"
              disabled={pending || a.disabledReason !== null}
              title={a.disabledReason ?? undefined}
              aria-describedby={a.disabledReason ? `why-${card.id}` : undefined}
              onClick={() => onAction(a)}
              className="text-agreed underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {reasons.length > 0 && (
        <p id={`why-${card.id}`} data-testid="disabled-reason" className="mt-1 text-xs text-muted">
          {reasons.join(" · ")}
        </p>
      )}
      {card.hint && (
        <p data-testid="card-hint" className="mt-2 border-t border-dashed border-hairline pt-1 text-xs">
          <span className="font-mono uppercase text-muted">{card.hint.tag}</span> · {card.hint.text}{" "}
          {card.hint.action && (
            <button
              type="button"
              disabled={pending || card.hint.action.disabledReason !== null}
              title={card.hint.action.disabledReason ?? undefined}
              onClick={() => onAction(card.hint!.action!)}
              className="text-agreed hover:underline disabled:text-muted"
            >
              {card.hint.action.label}
            </button>
          )}
        </p>
      )}
      {writing && (
        <form
          className="mt-2 flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            run((c) => answerHatNoteActionUI(card.id, text, writing === "add_to_page", c));
          }}
        >
          <label className="text-xs text-muted" htmlFor={`answer-${card.id}`}>
            {writing === "answer" ? "Your answer, as a new line under the one it's about" : "Add to the page as a question"}
          </label>
          <textarea id={`answer-${card.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={2} className="rounded border border-line px-2 py-1" />
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="rounded bg-ink px-2 py-0.5 text-paper">
              {writing === "answer" ? "Save answer" : "Add"}
            </button>
            <button type="button" onClick={() => setWriting(null)} className="rounded border border-line px-2 py-0.5">
              Cancel
            </button>
          </div>
        </form>
      )}
      {merging && card.mergeTargets && (
        <div className="mt-2 flex flex-col gap-1 text-xs">
          <label htmlFor={`merge-${card.id}`} className="text-muted">
            Merge into
          </label>
          <select id={`merge-${card.id}`} value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="rounded border border-line px-1 py-1">
            <option value="">Choose a line</option>
            {card.mergeTargets.map((t) => (
              <option key={t.blockId} value={t.blockId} disabled={t.disabledReason !== null} title={t.disabledReason ?? undefined}>
                {t.text.slice(0, 70)}
                {t.disabledReason ? " (agreed)" : ""}
              </option>
            ))}
          </select>
          <button type="button" disabled={!mergeInto || pending} onClick={() => run((c) => mergeDraftActionUI(card.id, mergeInto, c))} className="self-start rounded bg-ink px-2 py-0.5 text-paper disabled:opacity-50">
            Merge
          </button>
        </div>
      )}
      {confirm && (
        <div role="alert" className="mt-2 rounded border border-alert bg-alert-bg px-2 py-1 text-xs">
          <p>{confirm.warning}</p>
          <div className="mt-1 flex gap-2">
            <button type="button" className="rounded bg-ink px-2 py-0.5 text-paper" onClick={() => confirm.retry()}>
              Confirm
            </button>
            <button type="button" className="rounded border border-line px-2 py-0.5" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role="status" className="mt-1 text-xs text-muted">
          {message}
        </p>
      )}
    </li>
  );
}

function ExpiredList({ expired }: { expired: ExpiredDraftView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (!expired.length) return null;
  return (
    <section data-testid="expired-drafts" className="mt-6">
      <h3 className="font-mono text-xs uppercase tracking-wide text-muted">Expired drafts · {expired.length}</h3>
      <p className="text-xs text-muted">Archived, not deleted. The lead can bring one back.</p>
      <ul className="mt-2 space-y-2">
        {expired.map((d) => (
          <li key={d.id} data-testid={`expired-${d.id}`} className="rounded border border-dashed border-hairline px-3 py-2">
            <span className="block">{d.text}</span>
            <span className="block text-xs text-muted">{d.author} · expired</span>
            <button
              type="button"
              disabled={pending || d.restoreReason !== null}
              title={d.restoreReason ?? undefined}
              onClick={() =>
                start(async () => {
                  const r = await restoreDraftActionUI(d.id);
                  if (r.status === "refused") setMessage(r.reason);
                  else router.refresh();
                })
              }
              className="mt-1 text-xs text-agreed hover:underline disabled:text-muted"
            >
              Restore
            </button>
            {d.restoreReason && <span className="ml-2 text-xs text-muted">{d.restoreReason}</span>}
          </li>
        ))}
      </ul>
      {message && <p className="mt-1 text-xs text-muted">{message}</p>}
    </section>
  );
}

export function RightPanel({ storyId, panel, details, activity, expired }: Props) {
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
          <section data-testid="scrum-master" className="mt-4 rounded bg-ink px-3 py-2 text-paper">
            <h3 className="font-mono text-[11px] uppercase tracking-wide opacity-80">Scrum Master</h3>
            <p className="mt-1">{panel.summary}</p>
          </section>
          {panel.sections.map((s) => (
            <section key={s.key} data-testid={`panel-${s.key}`} className="mt-4">
              <h3 className="font-mono text-xs uppercase tracking-wide text-muted">
                {s.title} · {s.cards.length}
              </h3>
              <ul className="mt-2 space-y-2">
                {s.cards.map((c) => (
                  <Card key={c.id} card={c} storyId={storyId} />
                ))}
              </ul>
            </section>
          ))}
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
        <div role="tabpanel">
          <ExpiredList expired={expired} />
          <ol data-testid="activity" className="mt-4 space-y-2">
            {activity.length === 0 && <li className="text-muted">No activity yet.</li>}
            {activity.map((a) => (
              <li key={a.id}>
                {a.what === "draft.expired" ? "" : <span className="font-medium">{a.who} </span>}
                {ACTIVITY_LABELS[a.what] ?? a.what}
                <span className="block font-mono text-[11px] text-muted">{new Date(a.when).toLocaleString("en-GB")}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}
