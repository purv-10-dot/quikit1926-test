/**
 * Singleton PrismaClient.
 * In dev, Next.js hot-reload would otherwise create a new client per reload and
 * exhaust the Postgres connection pool — so we cache it on globalThis.
 *
 * IMPORTANT: business-table queries must NOT use this client directly. Use the
 * tenant-scoped helpers in lib/tenant-scope.ts (Phase 2) which inject the
 * tenantId filter automatically. Direct access here is for auth, tenants, and
 * SUPER_ADMIN paths only.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
