-- Least privilege and row level security (ADR-037).
--
-- The app connects at runtime as `app_runtime`: read and write rows, nothing else.
-- Migrations run as the schema owner from CI, never from the app.
-- On Supabase the `public` schema is also served by the Data API to the `anon` and
-- `authenticated` roles; they get no grants and no policies, so a leaked API key reads nothing.
--
-- Every new table must get the same treatment in its own migration:
--   ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY app_runtime_all ON "X" FOR ALL TO app_runtime USING (true) WITH CHECK (true);
-- tests/seed/security-db.test.ts fails if one is missed.

-- The role is created without a password and cannot log in. An operator enables it once:
--   ALTER ROLE app_runtime WITH LOGIN PASSWORD '<from the secret manager>';
-- (docs/deploy.md). Passwords never live in migrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_runtime;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY app_runtime_all ON public.%I FOR ALL TO app_runtime USING (true) WITH CHECK (true)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO app_runtime', t);
  END LOOP;
END
$$;

-- Prisma's migration history: nobody but the owner reads or writes it.
ALTER TABLE IF EXISTS public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Nothing for anyone else, including roles Supabase grants by default.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
    END IF;
  END LOOP;
END
$$;
