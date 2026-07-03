import { PrismaClient } from "@prisma/client";

/**
 * Finance feature DB client.
 *
 * QuikFinance accesses data through `$queryRaw` with BARE table names
 * (e.g. `FROM invoices`). After the platform merge those tables live in the
 * `app_quikfinance` Postgres schema (not `public`), so we pin this connection's
 * search_path to `app_quikfinance` and let it fall through to public/quikit/auth
 * for any cross-schema reads. This override is LOCAL to the finance client —
 * identity (User/Org/OrgMember) is read via @quikit/database + withOrgAuth,
 * which must NOT be forced onto this search_path.
 *
 * (search_path correctness is exercised at runtime — see Phase 5 verify.)
 */
declare global {
  // eslint-disable-next-line no-var
  var __qfPrisma: PrismaClient | undefined;
}

function financeDbUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  const sep = base.includes("?") ? "&" : "?";
  const opts = encodeURIComponent("-c search_path=app_quikfinance,public,quikit,auth");
  return `${base}${sep}options=${opts}`;
}

function makeClient(): PrismaClient {
  const url = financeDbUrl();
  return url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
}

export const prisma: PrismaClient = global.__qfPrisma ?? makeClient();

if (process.env.NODE_ENV !== "production") global.__qfPrisma = prisma;

export default prisma;
