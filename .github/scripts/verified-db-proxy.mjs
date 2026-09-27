// Starts a local PgBouncer that connects to the database with verified TLS (ADR-037).
//
// Prisma's migration engine negotiates TLS but doesn't verify the server certificate, whatever
// the URL says. So CI points Prisma at this proxy on loopback, and the proxy makes the real
// connection with server_tls_sslmode=verify-full against the database's CA.
//
// Usage: node verified-db-proxy.mjs <upstream-url> <ca-file> <workdir>
// Prints the local URL to use. Needs `pgbouncer` on PATH.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [upstream, caFile, workdir] = process.argv.slice(2);
if (!upstream || !caFile || !workdir) {
  console.error("usage: verified-db-proxy.mjs <upstream-url> <ca-file> <workdir>");
  process.exit(2);
}

const u = new URL(upstream);
const q = (v) => `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const database = decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres";
// Not 6432: the distro package starts its own PgBouncer there.
const PORT = 6433;

mkdirSync(workdir, { recursive: true, mode: 0o700 });
const ini = path.join(workdir, "pgbouncer.ini");
writeFileSync(
  ini,
  [
    "[databases]",
    `${database} = host=${q(u.hostname)} port=${u.port || 5432} dbname=${q(database)} user=${q(decodeURIComponent(u.username))} password=${q(decodeURIComponent(u.password))}`,
    "",
    "[pgbouncer]",
    "listen_addr = 127.0.0.1",
    `listen_port = ${PORT}`,
    // Loopback only, on a throwaway runner: the proxy itself holds the credentials.
    "auth_type = any",
    // Migrations take advisory locks, which need one server connection per client session.
    "pool_mode = session",
    "server_tls_sslmode = verify-full",
    `server_tls_ca_file = ${caFile}`,
    "unix_socket_dir =",
    "ignore_startup_parameters = extra_float_digits,options,search_path",
    `logfile = ${path.join(workdir, "pgbouncer.log")}`,
    `pidfile = ${path.join(workdir, "pgbouncer.pid")}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);

// Keep stdout for the URL alone; PgBouncer's own output goes to stderr.
execFileSync("pgbouncer", ["-d", ini], { stdio: ["ignore", 2, 2] });
console.log(`postgresql://proxy@127.0.0.1:${PORT}/${encodeURIComponent(database)}`);
