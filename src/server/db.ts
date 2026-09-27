// Prisma client on Postgres through the pg driver adapter. Server-side only.
// Created on first use, so building the app never needs database credentials (ADR-037).
import "server-only";
import { createPrisma, type Db } from "./prisma";

const globalForPrisma = globalThis as unknown as { prisma?: Db };

function client(): Db {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const created = createPrisma();
  // One client per server instance; in dev it also survives hot reloads.
  globalForPrisma.prisma = created;
  return created;
}

export const prisma: Db = new Proxy({} as Db, {
  get(_, key) {
    const c = client();
    const value = Reflect.get(c, key, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
