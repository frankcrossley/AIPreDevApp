// The app never silently opens the wrong database, or a remote one without verifying it (ADR-037).
import { describe, expect, it } from "vitest";
import { DatabaseConfigError, LOCAL_DATABASE_URL, databaseConfig } from "@/server/database-config";

const CA = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
const SUPABASE = "postgresql://app_runtime.abcd:secret@aws-0-eu-west-2.pooler.supabase.com:6543/postgres";

describe("databaseConfig", () => {
  it("uses the local database outside production when DATABASE_URL is unset", () => {
    expect(databaseConfig({ NODE_ENV: "development" })).toMatchObject({ connectionString: LOCAL_DATABASE_URL, ssl: false });
  });

  it("refuses to start in production without DATABASE_URL, rather than guessing", () => {
    expect(() => databaseConfig({ NODE_ENV: "production" })).toThrow(/DATABASE_URL is not set/);
  });

  it("refuses SQLite and other non-Postgres URLs", () => {
    expect(() => databaseConfig({ DATABASE_URL: "file:./prisma/dev.db" })).toThrow(/postgresql:\/\//);
    expect(() => databaseConfig({ DATABASE_URL: "mysql://u:p@db/app" })).toThrow(DatabaseConfigError);
    expect(() => databaseConfig({ DATABASE_URL: "not a url" })).toThrow(/not a valid URL/);
  });

  it("refuses a remote database without a CA certificate to verify it", () => {
    expect(() => databaseConfig({ NODE_ENV: "production", DATABASE_URL: SUPABASE })).toThrow(/DATABASE_CA_CERT/);
  });

  it("verifies a remote database against the CA, whatever sslmode the URL asks for", () => {
    const c = databaseConfig({ NODE_ENV: "production", DATABASE_URL: `${SUPABASE}?sslmode=disable&sslrootcert=/tmp/x`, DATABASE_CA_CERT: CA.replace(/\n/g, "\\n") });
    expect(c.ssl).toEqual({ ca: CA, rejectUnauthorized: true });
    expect(c.connectionString).not.toMatch(/sslmode|sslrootcert/);
    expect(c.connectionString).toContain("pooler.supabase.com:6543");
  });

  it("rejects a CA that isn't a certificate and a bad pool size", () => {
    expect(() => databaseConfig({ DATABASE_URL: SUPABASE, DATABASE_CA_CERT: "secret" })).toThrow(/PEM/);
    expect(() => databaseConfig({ DATABASE_URL: LOCAL_DATABASE_URL, DATABASE_POOL_MAX: "0" })).toThrow(/DATABASE_POOL_MAX/);
  });

  it("never puts the password in an error message", () => {
    try {
      databaseConfig({ DATABASE_URL: SUPABASE });
    } catch (e) {
      expect(String(e)).not.toContain("secret");
    }
  });
});
