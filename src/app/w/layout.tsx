// The single workspace (ADR-001, ADR-019): header and backlog stay put; the page swaps
// the centre and right columns.
import { backlogTree } from "@/domain/backlog";
import { nextSessionStart } from "@/domain/drafts";
import { BacklogTree } from "@/components/BacklogTree";
import { Header } from "@/components/Header";
import { getWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

const dayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { ctx, actorId, teamName } = await getWorkspace();
  const next = nextSessionStart(ctx.sessions, new Date());
  return (
    <div className="flex h-screen min-w-[1280px] flex-col">
      <Header
        teamName={teamName}
        nextSession={next ? dayLabel.format(next) : null}
        people={ctx.people.map((p) => ({ id: p.id, name: p.name }))}
        actorId={actorId}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[270px_minmax(0,1fr)_420px]">
        <BacklogTree epics={backlogTree(ctx)} />
        {children}
      </div>
    </div>
  );
}
