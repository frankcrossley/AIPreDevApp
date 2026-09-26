// Epic view (V6Epic): the PRFAQ in the centre, Alignment on the right.
// Read-only for now; editing and agreeing the PRFAQ arrive in bolt 5.
import { evaluatePrfaqAgreement, storiesServingNoPromise } from "@/domain/checks";
import type { DomainSnapshot, Epic } from "@/domain/types";
import { EpicPanel } from "./EpicPanel";

export function EpicView({ epic, ctx }: { epic: Epic; ctx: DomainSnapshot }) {
  const name = (id: string | null) => ctx.people.find((p) => p.id === id)?.name ?? "nobody";
  const prfaq = ctx.prfaqs.find((p) => p.epicId === epic.id);
  const quote = ctx.excerpts.find((e) => e.id === prfaq?.customerQuoteExcerptId);
  const quoteSource = ctx.sources.find((s) => s.id === quote?.sourceId);
  const faqs = ctx.faqEntries.filter((f) => f.prfaqId === prfaq?.id);
  const storyKey = (id: string) => ctx.stories.find((s) => s.id === id)?.key ?? id;
  const results = evaluatePrfaqAgreement(epic, ctx);
  const promises = ctx.promises.filter((p) => p.prfaqId === prfaq?.id);

  const alignment = {
    readBacks: epic.memberIds.map((id) => {
      const rb = ctx.readBacks.find((r) => r.epicId === epic.id && r.personId === id);
      return { personId: id, name: name(id), text: rb?.text ?? null, assessment: rb?.assessment ?? null, note: rb?.note ?? null };
    }),
    promises: promises.map((p) => ({
      id: p.id,
      text: p.text,
      stories: ctx.stories.filter((s) => s.promiseId === p.id).map((s) => s.key),
    })),
    unpromised: storiesServingNoPromise(epic, ctx).map((s) => ({ key: s.key, title: s.title })),
    blockers: results.filter((r) => !r.passed).map((r) => r.reason),
  };

  return (
    <>
      <main data-testid="centre" className="overflow-y-auto bg-paper px-10 py-6">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-wide text-muted">
          <span>{epic.key} · Epic · PRFAQ</span>
          <span data-testid="state-pill" className={`rounded border px-2 py-0.5 ${prfaq?.state === "agreed" ? "border-agreed text-agreed" : "border-alert text-alert"}`}>
            {prfaq?.state === "agreed" ? "Agreed" : "Not yet aligned"}
          </span>
          <span>
            Owner {name(epic.ownerId)} · Decider {name(epic.deciderId)}
          </span>
        </div>
        {!prfaq ? (
          <p className="mt-6 text-muted">This epic has no PRFAQ yet.</p>
        ) : (
          <article data-testid="prfaq" className="max-w-3xl">
            <h1 className="mt-3 font-serif text-3xl font-medium">{prfaq.headline}</h1>
            <p className="mt-2 text-lg text-muted">{prfaq.subhead}</p>
            <h2 className="mt-6 font-mono text-xs uppercase tracking-wide text-muted">The problem</h2>
            <p className="mt-1">{prfaq.problem}</p>
            <h2 className="mt-6 font-mono text-xs uppercase tracking-wide text-muted">What changes</h2>
            <p className="mt-1">{prfaq.whatChanges}</p>
            {quote && (
              <figure className="mt-6 border-l-2 border-agreed pl-4">
                <blockquote className="font-serif text-xl">&ldquo;{quote.text}&rdquo;</blockquote>
                <figcaption className="mt-1 font-mono text-xs text-muted">
                  {quoteSource?.title}, {quote.locator} · a real quote, not written by us
                </figcaption>
              </figure>
            )}
            <h2 className="mt-6 font-mono text-xs uppercase tracking-wide text-muted">How we&apos;ll know it worked</h2>
            <p className="mt-1">{prfaq.successMeasure ?? <span className="text-alert">No success measure yet.</span>}</p>
            {(["customer", "internal"] as const).map((audience) => (
              <section key={audience}>
                <h2 className="mt-6 font-mono text-xs uppercase tracking-wide text-muted">{audience === "customer" ? "Customer FAQ" : "Internal FAQ"}</h2>
                <dl className="mt-2 space-y-3">
                  {faqs
                    .filter((f) => f.audience === audience)
                    .map((f) => (
                      <div key={f.id} className={f.blocking && !f.answer ? "rounded border border-alert bg-alert-bg px-3 py-2" : ""}>
                        <dt className="font-medium">{f.question}</dt>
                        <dd className="text-muted">
                          {f.answer ?? (f.blocking ? "No answer yet. This blocks alignment." : "Open.")}
                          {f.storyIds.map((id) => (
                            <a key={id} href={`/w/${storyKey(id)}`} className="ml-2 font-mono text-xs">
                              {storyKey(id)}
                            </a>
                          ))}
                        </dd>
                      </div>
                    ))}
                </dl>
              </section>
            ))}
          </article>
        )}
      </main>
      <EpicPanel alignment={alignment} details={[["Owner", name(epic.ownerId)], ["Decider", name(epic.deciderId)], ["Members", epic.memberIds.map(name).join(", ")]]} />
    </>
  );
}
