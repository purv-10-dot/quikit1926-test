/**
 * Platform ORG database client (quikit_dev) — the shared identity DB that holds
 * User / OrgMember / UserAppAccess / App. Separate from this app's LMS client
 * (`@/lib/prisma`, quikskill_lms).
 *
 * Resolved via the `@quikit/org-prisma` alias (see next.config.mjs + tsconfig)
 * so the app-wide `@prisma/client → LMS client` alias does not hijack it. Points
 * at ORG_DATABASE_URL. Used only by lib/services/identity-service.ts to dual-write
 * central identities when the LMS creates a login-capable user.
 *
 * This is an interim bridge until the Phase-3 fold makes the LMS consume the
 * shared client directly.
 */
// Import the generated ORG client via `.prisma/client` — it resolves to the
// @quikit/database (org) client in BOTH Node and webpack, and the app-wide
// `@prisma/client → LMS` alias does not match this specifier. (A webpack-only
// alias fails Next's Node-based "collect page data" step.)
import { PrismaClient } from '.prisma/client';

const ORG_URL = process.env.ORG_DATABASE_URL;

const globalForOrg = globalThis as unknown as { orgPrisma?: PrismaClient };

export const orgDb: PrismaClient =
  globalForOrg.orgPrisma ??
  new PrismaClient(
    ORG_URL ? { datasources: { db: { url: ORG_URL } } } : undefined,
  );

if (process.env.NODE_ENV !== 'production') globalForOrg.orgPrisma = orgDb;

/** True when the org DB is configured — identity dual-write is only possible then. */
export const ORG_DB_ENABLED = Boolean(ORG_URL);
