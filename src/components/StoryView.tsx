// Story view (V6Story): the notebook in the centre, "For this item" on the right.
import { evaluateBuiltRight, evaluateRightThing } from "@/domain/checks";
import { STATE_LABELS } from "@/domain/backlog";
import { notebookView } from "@/domain/notebook-view";
import { panelSections } from "@/domain/panel";
import type { CheckResult, DomainSnapshot, Story } from "@/domain/types";
import { anchorFor, storyEvents } from "@/server/workspace";
import { Meters, type MeterLine } from "./Meters";
import { RightPanel } from "./RightPanel";
import { SectionEditor } from "./SectionEditor";

const CRITERIA_SECTION = "Acceptance criteria";

export async function StoryView({ story, ctx, actorId }: { story: Story; ctx: DomainSnapshot; actorId: string }) {
  const name = (id: string | null) => ctx.people.find((p) => p.id === id)?.name ?? "nobody";
  const template = ctx.templates.find((t) => t.id === story.templateId);
  const promise = ctx.promises.find((p) => p.id === story.promiseId);
  const epic = ctx.epics.find((e) => e.id === story.epicId)!;
  const toLines = (results: CheckResult[]): MeterLine[] =>
    results.map((r) => ({ key: r.key, label: r.label, tier: r.tier, passed: r.passed, reason: r.reason, anchor: anchorFor(r.fixTarget, ctx) }));

  const sections = template?.sections ?? [];
  const view = notebookView(story, ctx, sections.filter((x) => x !== CRITERIA_SECTION));
  const criteria = ctx.criteria.filter((c) => c.storyId === story.id);
  const panel = panelSections(story, ctx);
  const events = await storyEvents(story.id);

  return (
    <>
      <main data-testid="centre" className="overflow-y-auto bg-paper px-10 py-6">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-wide text-muted">
          <span>{story.key} · Story</span>
          <span data-testid="state-pill" className="rounded border border-line px-2 py-0.5 text-ink">
            {STATE_LABELS[story.state]}
          </span>
          <span>Lead {name(story.leadId)}</span>
        </div>
        <h1 data-testid="story-title" className="mt-2 font-serif text-3xl font-medium">
          {story.title}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {promise ? (
            <>
              Serves the PRFAQ promise <a href={`/w/${epic.key}`}>&ldquo;{promise.text}&rdquo;</a> in {epic.key}
            </>
          ) : (
            <span className="text-alert">Serves no promise in the {epic.key} PRFAQ</span>
          )}
        </p>
        <Meters rightThing={toLines(evaluateRightThing(story, ctx))} builtRight={toLines(evaluateBuiltRight(story, ctx))} />

        <div className="mt-6 flex gap-1 font-mono text-xs uppercase" role="tablist" aria-label="Notebook view">
          <span role="tab" aria-selected="true" className="rounded bg-ink px-2 py-1 text-paper">
            Notes
          </span>
          <span role="tab" aria-selected="false" aria-disabled="true" title="Shaping arrives in a later build" className="rounded px-2 py-1 text-muted">
            Shaped
          </span>
        </div>

        {sections.map((section) => {
          if (section === CRITERIA_SECTION) {
            return (
              <section key={section} className="mt-6">
                <h2 className="font-mono text-xs uppercase tracking-wide text-muted">{section}</h2>
                <ul className="mt-2 space-y-2 text-sm">
                  {criteria.map((c) => (
                    <li
                      key={c.id}
                      id={`criterion-${c.id}`}
                      className={`rounded border px-3 py-2 ${c.origin === "hat" && !c.confirmedBy ? "border-dashed border-muted" : "border-hairline"}`}
                    >
                      Given {c.given}, when {c.when}, then {c.then}
                    </li>
                  ))}
                  {criteria.length === 0 && <li className="text-muted">No acceptance criteria yet.</li>}
                </ul>
              </section>
            );
          }
          const v = view.sections.find((x) => x.name === section)!;
          return (
            <SectionEditor
              key={`${story.id}:${section}`}
              storyId={story.id}
              epicId={story.epicId}
              section={section}
              required={v.required}
              initialLines={v.lines}
              chips={view.chips}
              sources={view.sources}
            />
          );
        })}
        <p className="mt-8 font-mono text-xs text-muted">
          Keep writing. Start a line with <kbd>?</kbd> for a question, <kbd>decision:</kbd> for a decision, <kbd>assume:</kbd> for an
          assumption or <kbd>risk:</kbd> for a risk. Select text to turn it into an item.
        </p>
      </main>
      <RightPanel
        panel={panel}
        details={[
          ["Lead", name(story.leadId)],
          ["Template", template?.name ?? "none"],
          ["Estimate", story.estimate === null ? "Not estimated" : String(story.estimate)],
          ["Jira", story.jiraKey ?? "Not exported"],
          ["Signed off", story.signedOffBy ? `${name(story.signedOffBy)}` : "No"],
        ]}
        activity={events.map((e) => ({ id: e.id, who: name(e.actorId), what: e.type, when: e.createdAt.toISOString(), payload: e.payloadJson }))}
        actorId={actorId}
      />
    </>
  );
}
