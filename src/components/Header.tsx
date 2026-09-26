"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setViewingAs } from "@/app/actions";

interface Props {
  teamName: string;
  nextSession: string | null;
  people: { id: string; name: string }[];
  actorId: string;
}

export function Header({ teamName, nextSession, people, actorId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-6 border-b border-hairline bg-panel px-4 text-sm">
      <span className="font-serif text-base font-medium">{teamName}</span>
      <span className="font-mono text-xs uppercase tracking-wide text-muted">
        {nextSession ? `Next refinement · ${nextSession}` : "No refinement planned"}
      </span>
      <span className="ml-auto font-mono text-xs uppercase tracking-wide text-muted">Jira simulated</span>
      <label className="flex items-center gap-2">
        <span className="text-muted">Viewing as</span>
        <select
          aria-label="Viewing as"
          className="rounded border border-line bg-panel px-2 py-1"
          value={actorId}
          disabled={pending}
          onChange={(e) => {
            const id = e.target.value;
            start(async () => {
              await setViewingAs(id);
              router.refresh();
            });
          }}
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
