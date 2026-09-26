# Seed data

Everything the prototype loads with `npm run db:reset`. It mirrors the v6 wireframes: the usage-based billing epic (BILL-142) and its stories.

- `seed.json`: people, templates, the epic, stories, the PRFAQ, read-backs, sources and excerpts, notebook blocks, items, stances, criteria, hat notes, drafts, a planned session and the simulated Jira settings.
- `sources/acme-call.txt`: a discovery call transcript with timestamps, for the ingestion flow.
- `sources/survey.csv`: 40 stakeholder survey responses. They theme into 14 on live usage, 11 preferring a flat fee, 9 overcharged after upgrading and 6 wanting project grouping.

Dates are relative (`daysAgo`, `createdDaysAgo`, `inDays`) and resolved against "now" when seeding, so draft expiry behaves realistically in demos.

`_expected` in `seed.json` lists what the checks should show for the seeded data. Use it as the first domain tests in bolt 1.

**Make it yours.** Replace this with a real (anonymised) slice of a design partner's backlog before running sessions with them.
