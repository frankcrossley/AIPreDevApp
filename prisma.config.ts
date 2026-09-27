// Prisma CLI configuration (generate, migrate). The running app connects through
// src/server/prisma.ts instead. Migrations use the schema owner's direct connection,
// MIGRATION_DATABASE_URL, which only CI holds (ADR-037); the app's runtime role can't run DDL.
import { defineConfig } from "prisma/config";
import { LOCAL_DATABASE_URL } from "./src/server/database-config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Never throws: `prisma generate` runs at build time without any database credentials.
  datasource: { url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? LOCAL_DATABASE_URL },
});
