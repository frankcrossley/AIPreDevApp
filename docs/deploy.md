# Deploying: Vercel + Supabase

How production is wired (ADR-037), and the one-time steps an operator does by hand. No secret in this document or anywhere in git.

## Shape

| Piece | Where | Credentials it holds |
|---|---|---|
| App (Next.js) | Vercel | `DATABASE_URL` for the runtime login, `DATABASE_CA_CERT` |
| Database | Supabase Postgres | — |
| Migrations | GitHub Actions, `.github/workflows/migrate.yml`, environment `production` | `MIGRATION_DATABASE_URL` (schema owner), `DATABASE_CA_CERT` |

- The app connects through Supabase's **transaction pooler** (port 6543) as the runtime login. That login can read and write rows and nothing else (migration `0002_security`).
- Migrations connect as the **schema owner** (`postgres`) from CI only. Vercel never holds these credentials.
- Every table has row level security, with a policy for `app_runtime` only. Supabase's Data API roles (`anon`, `authenticated`) have no grants, so the project's API keys expose nothing.
- TLS is verified end to end: the app checks the server certificate against `DATABASE_CA_CERT`. In CI, Prisma's migration engine can't verify certificates itself, so it goes through a local PgBouncer that does (`.github/scripts/verified-db-proxy.mjs`).

## One-time setup

1. **Supabase project.**
   - Create it in the region closest to the Vercel functions.
   - Database settings: turn on *Enforce SSL on incoming connections*.
   - Under network restrictions, allow only what needs direct access, if your plan supports it.
   - Download the **SSL certificate** (the project's CA). This is `DATABASE_CA_CERT`.

2. **Migration secrets.**
   - In GitHub, go to Settings → Environments and create **`production`**.
   - Add required reviewers, and limit deployment branches to `main`.
   - Add the environment secrets:
     - `MIGRATION_DATABASE_URL`: the **session pooler** URL as `postgres`, for example `postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres`. The direct `db.<ref>.supabase.co` host is IPv6-only unless you have the IPv4 add-on, and GitHub runners have no IPv6.
     - `DATABASE_CA_CERT`: the PEM text of the certificate from step 1.

3. **First migration.**
   - Run the *Migrate production database* workflow (Actions → Run workflow), or merge to `main`.
   - This creates the tables, RLS, policies and the `app_runtime` role. The role can't log in yet.

4. **Enable the runtime login.**
   - In the Supabase SQL editor (as `postgres`), run:
     ```sql
     ALTER ROLE app_runtime WITH LOGIN PASSWORD '<generate 32+ random characters; store it in your secret manager>';
     ```
   - Keep the password only in your secret manager and in Vercel.

5. **Vercel environment variables.** Set these for **Production** only:
   - `DATABASE_URL`: `postgresql://app_runtime.<project-ref>:<runtime-password>@aws-0-<region>.pooler.supabase.com:6543/postgres`. This is the transaction pooler; the `.<project-ref>` suffix is how Supavisor routes custom roles.
   - `DATABASE_CA_CERT`: the same PEM. Literal `\n` escapes are accepted if the UI flattens newlines.
   - Optional: `DATABASE_POOL_MAX` (default 3 per function instance).
   - Don't give Preview deployments the production database. Either leave `DATABASE_URL` unset for Preview (preview pages then fail with a clear configuration error), or point Preview at a separate Supabase project or branch.

6. **Seed once.** The workspace needs its seed data.
   - From a trusted machine, with the runtime URL and CA exported, run:
     ```sh
     SEED_CONFIRM=aws-0-<region>.pooler.supabase.com npm run db:seed
     ```
   - The seed refuses unless `SEED_CONFIRM` names the host, and refuses any database that already has data.

7. **Protect the deployment.**
   - The app has no login yet (ADR-003): anyone who can open it can act as anyone.
   - Turn on Vercel Deployment Protection (Vercel Authentication or password) for Production until auth is built.

## Every change after that

- **Schema changes** go in a new migration under `prisma/migrations/`.
  - A new table must enable RLS and add the `app_runtime_all` policy in the same migration (see the header of `0002_security/migration.sql`). `tests/seed/security-db.test.ts` fails otherwise.
- **Merging to `main`** deploys the app on Vercel and, when migrations changed, runs the migration workflow after a reviewer approves.
  - The two run independently, so migrations must be backward compatible: add first, remove in a later release.
- **The build** (`npm run build`) runs `prisma generate` and `next build`. It never connects to a database.

## Rotating credentials

- **Runtime password:**
  1. `ALTER ROLE app_runtime WITH PASSWORD '<new>'`.
  2. Update `DATABASE_URL` in Vercel.
  3. Redeploy.
- **Owner password:** reset it in Supabase, then update the `MIGRATION_DATABASE_URL` secret.
- **CA certificate:** update `DATABASE_CA_CERT` in both Vercel and GitHub when Supabase rotates it.

## Diagnosing

| Symptom | Cause |
|---|---|
| `DatabaseConfigError: DATABASE_URL is not set` | The env var is missing for this Vercel environment. |
| `DatabaseConfigError: … must be a postgresql:// URL` | An old `file:` SQLite URL is still configured. |
| `DatabaseConfigError: … DATABASE_CA_CERT is not set` | Remote database without the CA. |
| `self-signed certificate` / `certificate verify failed` | Wrong CA, or not Supabase's certificate. |
| `permission denied for table …` | A table was added without the grants and policy for `app_runtime`. |
| `The table … does not exist` | Migrations haven't run against this database. Check the workflow run. |

## Local development

- Run `docker compose up -d` (Postgres 16 on 127.0.0.1:5432), then `npm run dev`. The database is created and seeded on first run.
- `npm run db:reset` recreates it. It refuses any host that isn't this machine.
- Tests create throwaway databases from a migrated template on the same local server.
