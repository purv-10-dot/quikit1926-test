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

// Distinct global slot — the central `@quikit/database` package also caches
// its client on `global.prisma`, so if we use the same key it clobbers us
// and queries through this `db` end up hitting the central client (which
// has Cn* models WITHOUT @@map directives, so they point at non-existent
// tables like "CnCompany" instead of the real "Companies").
const globalForPrisma = globalThis as unknown as { prismaQuikInfra: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.prismaQuikInfra ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaQuikInfra = db;
