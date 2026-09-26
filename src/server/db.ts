// Prisma client on SQLite through the better-sqlite3 driver adapter. Server-side only.
import "server-only";
import { createPrisma } from "./prisma";

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createPrisma> };

export const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
