"use client";
// Other people's suggestions, shown dashed under the line they're about (ADR-025).
// The lead accepts or rejects them here or from the right panel.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptDraftActionUI, rejectDraftActionUI } from "@/app/actions";
import type { SuggestionView } from "@/domain/notebook-view";

function Suggestion({ s }: { s: SuggestionView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const accept = (confirmReopen: boolean) =>
    start(async () => {
      const r = await acceptDraftActionUI(s.id, confirmReopen);
      if (r.status === "needs_confirmation") setConfirm(r.warning);
      else if (r.status === "refused") setMessage(r.reason);
      else router.refresh();
    });
  return (
    <li data-testid={`suggestion-${s.id}`} className="rounded border border-dashed border-agreed bg-agreed-bg/40 px-2 py-1 text-sm">
      <span className="font-mono text-[11px] uppercase text-agreed">Suggested by {s.author}</span>{" "}
      <span className="font-mono text-[11px] text-muted">· {s.expiry}</span>
      <span className="block">{s.description}</span>
      <span className="flex gap-3 text-xs">
        <button type="button" disabled={pending || s.triageReason !== null} title={s.triageReason ?? undefined} onClick={() => accept(false)} className="text-agreed hover:underline disabled:text-muted">
          Accept
        </button>
        <button
          type="button"
          disabled={pending || s.triageReason !== null}
          title={s.triageReason ?? undefined}
          onClick={() =>
            start(async () => {
              const r = await rejectDraftActionUI(s.id);
              if (r.status === "refused") setMessage(r.reason);
              else router.refresh();
            })
          }
          className="text-agreed hover:underline disabled:text-muted"
        >
          Reject
        </button>
        {s.triageReason && <span className="text-muted">{s.triageReason}</span>}
      </span>
      {confirm && (
        <span role="alert" data-testid="accept-warning" className="mt-1 block rounded border border-alert bg-alert-bg px-2 py-1 text-xs">
          {confirm}{" "}
          <button type="button" onClick={() => accept(true)} className="ml-1 rounded bg-ink px-2 py-0.5 text-paper">
            Accept and reopen
          </button>{" "}
          <button type="button" onClick={() => setConfirm(null)} className="rounded border border-line px-2 py-0.5">
            Cancel
          </button>
        </span>
      )}
      {message && <span className="block text-xs text-muted">{message}</span>}
    </li>
  );
}

export function SuggestionList({ suggestions }: { suggestions: SuggestionView[] }) {
  return (
    <ul className="my-1 space-y-1">
      {suggestions.map((s) => (
        <Suggestion key={s.id} s={s} />
      ))}
    </ul>
  );
}
