// Epic view (V6Epic): the PRFAQ in the centre, Alignment on the right. Everything shown comes
// from src/domain/prfaq.ts and src/domain/panel.ts.
import { forThisEpic } from "@/domain/panel";
import { prfaqView } from "@/domain/prfaq";
import { sessionDayLabel } from "@/domain/scrum-master";
import type { DomainSnapshot, Epic } from "@/domain/types";
import { EpicPanel } from "./EpicPanel";
import { EpicPrfaq } from "./EpicPrfaq";

export function EpicView({ epic, ctx, actorId }: { epic: Epic; ctx: DomainSnapshot; actorId: string }) {
  const now = new Date();
  const view = prfaqView(epic, ctx, actorId);
  const name = (id: string) => ctx.people.find((p) => p.id === id)?.name ?? id;
  const next = ctx.sessions.filter((s) => s.status !== "ended" && s.date.getTime() >= now.getTime()).sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  return (
    <>
      <main data-testid="centre" className="overflow-y-auto bg-paper px-10 py-6">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-wide text-muted">
          <span>{epic.key} · Epic · PRFAQ</span>
          <span data-testid="state-pill" className={`rounded border px-2 py-0.5 ${view.state === "agreed" ? "border-agreed bg-agreed-bg text-agreed" : "border-alert text-alert"}`}>
            {view.state === "agreed" ? "Agreed" : "Not yet aligned"}
          </span>
          <span>
            Owner {view.owner} · Decider {view.decider}
          </span>
        </div>
        <EpicPrfaq epicId={epic.id} view={view} />
      </main>
      <EpicPanel
        epicId={epic.id}
        view={view}
        cards={forThisEpic(epic, ctx, now, actorId)}
        session={next ? { id: next.id, label: sessionDayLabel(next.date), agenda: next.agenda } : null}
        details={[
          ["Owner", view.owner],
          ["Decider", view.decider],
          ["Members", epic.memberIds.map(name).join(", ")],
        ]}
      />
    </>
  );
}
