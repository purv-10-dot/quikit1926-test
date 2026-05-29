/**
 * Prisma client singleton for QuikInfra.
 *
 * This module is the earliest-loaded server-side module (imported by every
 * route handler that touches the DB). We use it as the boot hook for env
 * validation — importing `env` here runs the Zod schema on first use, and
 * throws a clear error in production when config is missing or illegal.
 * In dev/test it logs a warning and continues.
 */

// Eagerly validate env on first import — must run BEFORE PrismaClient
// construction so missing DATABASE_URL etc. fails fast with a clear message
// instead of Prisma's less-helpful runtime error.
import "@/lib/config/env";

// Generated to a custom path (see schema.prisma generator block) so our
// client doesn't get overwritten by the root workspace schema every
// postinstall. The relative path resolves through the app's node_modules.
import { PrismaClient } from "../../../node_modules/.prisma-qc2/client";

// Unique cache key so we don't collide with the shared @quikit/database
// client (which uses `global.prisma`). If both used the same key, whichever
// imported first would win — and since @quikit/database has no `cnUser`
// model, any cn_* query would crash with "Cannot read properties of
// undefined (reading 'findFirst')".
const globalForPrisma = globalThis as unknown as { quikinfraPrisma?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.quikinfraPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.quikinfraPrisma = db;
