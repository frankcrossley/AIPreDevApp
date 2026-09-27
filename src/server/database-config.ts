// Turns the environment into a Postgres connection config, or refuses (ADR-037).
// Kept free of `server-only` so scripts and tests can use it. Never logs secrets.

/** What the pg driver adapter needs (a subset of pg's PoolConfig). */
export interface DatabaseConfig {
  connectionString: string;
  ssl: false | { ca: string; rejectUnauthorized: true };
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

/** Local development and test default. Production must set DATABASE_URL. */
export const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/predev";

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
// TLS is decided here, not by the URL: pg lets these override the `ssl` option.
const URL_TLS_PARAMS = ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat", "sslnegotiation"];

export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host) || host === "" || host.startsWith("/");
}

function parse(url: string, name: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DatabaseConfigError(`${name} is not a valid URL. Expected postgresql://user:password@host:port/database.`);
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new DatabaseConfigError(`${name} must be a postgresql:// URL, got ${parsed.protocol}//. SQLite files are no longer supported (ADR-037).`);
  }
  return parsed;
}

/** The URL for `name`, or the local default outside production. */
export function databaseUrl(env: Env = process.env, name = "DATABASE_URL"): string {
  const url = env[name]?.trim();
  if (url) return url;
  if (env.NODE_ENV === "production") throw new DatabaseConfigError(`${name} is not set. Production never falls back to a default database.`);
  return LOCAL_DATABASE_URL;
}

/** PEM text from an env var that may carry literal `\n` escapes. */
function caCert(env: Env): string | null {
  const raw = env.DATABASE_CA_CERT?.trim();
  if (!raw) return null;
  const pem = raw.replace(/\\n/g, "\n");
  if (!pem.includes("-----BEGIN CERTIFICATE-----")) throw new DatabaseConfigError("DATABASE_CA_CERT must be a PEM certificate.");
  return pem;
}

/**
 * Remote databases always use TLS with the certificate verified against DATABASE_CA_CERT
 * (Supabase's CA). A remote URL without it is refused rather than connected unverified.
 */
export function databaseConfig(env: Env = process.env, name = "DATABASE_URL"): DatabaseConfig {
  const parsed = parse(databaseUrl(env, name), name);
  for (const p of URL_TLS_PARAMS) parsed.searchParams.delete(p);
  const ca = caCert(env);
  const local = isLocalHost(parsed.hostname);
  if (!local && !ca) {
    throw new DatabaseConfigError(`${name} points at a remote host but DATABASE_CA_CERT is not set. Remote connections must verify the server certificate.`);
  }
  const max = Number(env.DATABASE_POOL_MAX ?? 3);
  if (!Number.isInteger(max) || max < 1) throw new DatabaseConfigError("DATABASE_POOL_MAX must be a positive integer.");
  return {
    connectionString: parsed.toString(),
    ssl: ca ? { ca, rejectUnauthorized: true } : false,
    max,
    // Serverless instances come and go: don't hold idle connections against the pooler.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  };
}
