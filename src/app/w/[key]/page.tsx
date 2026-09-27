// Centre and right columns for the selected story or epic. Everything shown is computed
// on the server from src/domain; client components only display it.
import { notFound } from "next/navigation";
import { EpicView } from "@/components/EpicView";
import { StoryView } from "@/components/StoryView";
import { getWorkspace } from "@/server/workspace";

export default async function WorkspacePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { ctx, actorId } = await getWorkspace();
  const story = ctx.stories.find((s) => s.key === key);
  if (story) return <StoryView story={story} ctx={ctx} actorId={actorId} />;
  const epic = ctx.epics.find((e) => e.key === key);
  if (epic) return <EpicView epic={epic} ctx={ctx} actorId={actorId} />;
  notFound();
}
