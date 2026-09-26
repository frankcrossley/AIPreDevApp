// Bolt 1 placeholder: the backlog with computed meters. The three-column workspace arrives in bolt 2.
// Meters are computed by src/domain on the server; this component only displays them.
import { evaluateBuiltRight, evaluateRightThing } from "@/domain/checks";
import { meterText } from "@/domain/report";
import { prisma } from "@/server/db";
import { loadSnapshot } from "@/server/snapshot";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await loadSnapshot(prisma);
  const rows = ctx.stories.map((story) => ({
    story,
    rightThing: meterText(evaluateRightThing(story, ctx)),
    builtRight: meterText(evaluateBuiltRight(story, ctx)),
  }));

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="font-serif text-2xl">Backlog</h1>
      <p className="mt-1 text-sm text-muted">Checks are computed from the notebook. Nobody can set them by hand.</p>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-hairline text-left font-mono text-xs uppercase text-muted">
            <th className="py-2">Key</th>
            <th>Title</th>
            <th>State</th>
            <th>Right thing</th>
            <th>Built right</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ story, rightThing, builtRight }) => (
            <tr key={story.id} data-testid={`story-${story.key}`} className="border-b border-hairline">
              <td className="py-2 font-mono">{story.key}</td>
              <td>{story.title}</td>
              <td className="font-mono text-xs">{story.state.replace("_", " ")}</td>
              <td data-testid="right-thing">{rightThing}</td>
              <td data-testid="built-right">{builtRight}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
