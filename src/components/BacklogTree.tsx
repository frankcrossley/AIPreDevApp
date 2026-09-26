"use client";
// Left column: the backlog tree. Rows show computed state and meters; nothing is computed here.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { BacklogEpic, BacklogRow } from "@/domain/backlog";

function Meter({ label, m }: { label: string; m: { passed: number; total: number } }) {
  const ok = m.passed === m.total;
  return (
    <span className={ok ? "text-agreed" : "text-muted"}>
      {label} {m.passed}/{m.total}
    </span>
  );
}

function Row({ row, active }: { row: BacklogRow; active: boolean }) {
  return (
    <li>
      <Link
        href={`/w/${row.key}`}
        data-testid={`backlog-${row.key}`}
        aria-current={active ? "page" : undefined}
        className={`block border-l-2 px-3 py-2 text-ink ${active ? "border-ink bg-panel" : "border-transparent hover:bg-panel/60"}`}
      >
        <span className="font-mono text-xs">{row.key}</span> <span>{row.title}</span>
        <span className="mt-1 flex flex-wrap gap-x-2 font-mono text-[11px] uppercase tracking-wide">
          <span data-testid="row-state" className={row.ready ? "rounded bg-agreed-bg px-1 text-agreed" : "text-ink"}>
            {row.stateLabel}
          </span>
          <Meter label="Right" m={row.rightThing} />
          <Meter label="Built" m={row.builtRight} />
        </span>
        {row.flags.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1 font-mono text-[11px] uppercase tracking-wide">
            {row.flags.map((f) => (
              <span
                key={f.kind}
                data-testid={`flag-${f.kind}`}
                className={
                  f.kind === "sprint" ? "text-agreed" : "rounded border border-dashed border-alert px-1 text-alert"
                }
              >
                {f.label}
              </span>
            ))}
          </span>
        )}
      </Link>
    </li>
  );
}

export function BacklogTree({ epics }: { epics: BacklogEpic[] }) {
  const pathname = usePathname();
  const activeKey = decodeURIComponent(pathname.split("/")[2] ?? "");
  return (
    <nav data-testid="backlog" aria-label="Backlog" className="overflow-y-auto border-r border-hairline bg-sunk text-sm">
      <h2 className="px-3 pt-3 pb-1 font-mono text-xs uppercase tracking-wide text-muted">Backlog</h2>
      {epics.map((epic) => (
        <div key={epic.id}>
          <Link
            href={`/w/${epic.key}`}
            data-testid={`backlog-${epic.key}`}
            aria-current={activeKey === epic.key ? "page" : undefined}
            className={`block border-l-2 px-3 py-2 text-ink ${activeKey === epic.key ? "border-ink bg-panel" : "border-transparent hover:bg-panel/60"}`}
          >
            <span className="font-mono text-xs">{epic.key}</span> <span className="font-medium">{epic.title}</span>
            <span className={`mt-1 block font-mono text-[11px] uppercase tracking-wide ${epic.prfaqAgreed ? "text-agreed" : "text-alert"}`}>
              Alignment {epic.alignment.passed} of {epic.alignment.total}
            </span>
          </Link>
          <ul className="ml-3 border-l border-hairline">
            {epic.stories.map((row) => (
              <Row key={row.id} row={row} active={row.key === activeKey} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
