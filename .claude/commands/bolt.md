Start bolt $ARGUMENTS from plans/bolts.md.

1. Read CLAUDE.md, then the section for bolt $ARGUMENTS in plans/bolts.md.
2. Read every file it names: acceptance features, docs/domain.md, docs/decisions.md, and docs/screens.md plus the wireframes if it touches UI, or docs/ai-teammate.md if it touches AI.
3. Stay in plan mode. Propose a plan that:
   - maps every acceptance scenario to the test that will prove it;
   - lists files you'll create or change;
   - names any decision not covered by docs/decisions.md, with a proposed ADR;
   - lists anything you think is ambiguous in the spec, as questions.
4. Wait for my approval before writing code.
5. When building: domain tests first, then implementation, then UI and e2e tests.
6. When you think it's done, run the qa-reviewer and architect-reviewer subagents, address their findings, run all checks, then summarise what's done and what was deferred, and tick the bolt in plans/bolts.md.
