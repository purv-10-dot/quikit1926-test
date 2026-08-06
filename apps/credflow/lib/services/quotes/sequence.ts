/**
 * Tenant-scoped auto-numbering.
 *
 * The Quotes module wants human-readable QT-YYYY-NNNN identifiers, but
 * Postgres sequences are global (not tenant-scoped) and Prisma's @default
 * doesn't accept per-tenant counters. So we keep a CrmSequence row per
 * (tenantId, name) and bump it inside a transaction.
 *
 * Concurrency: we use Prisma's `upsert` with an atomic `{ increment: 1 }`
 * update. Postgres takes a row-level lock for the duration of the UPDATE,
 * so two parallel quote creates serialise here without ever returning a
 * duplicate number.
 *
 * The "year" is derived from the caller-supplied issue date (defaults to
 * `new Date()` in the route). This way the counter resets cleanly on
 * Jan 1 — QT-2026-0001 in January, QT-2027-0001 the following year.
 */

import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";

type DbClient = typeof db | Prisma.TransactionClient;

export interface NextNumberArgs {
  tenantId: string;
  /** Logical bucket name. For quotes: `"quote-${year}"`. */
  name: string;
  /** Sprintf-like printf width for the numeric part. Default 4 (→ "0001"). */
  width?: number;
  /** Prefix applied to the formatted number. For quotes: `"QT-${year}-"`. */
  prefix: string;
}

/**
 * Returns the next formatted number for a tenant/bucket and increments the
 * counter atomically. Caller MUST run this inside the same Prisma
 * transaction as the quote create so a failed quote insert doesn't burn a
 * number.
 */
export async function nextFormattedNumber(
  tx: DbClient,
  args: NextNumberArgs,
): Promise<{ counter: number; formatted: string }> {
  const width = args.width ?? 4;
  const row = await tx.crmSequence.upsert({
    where: { sequence_uk: { tenantId: args.tenantId, name: args.name } },
    create: { tenantId: args.tenantId, name: args.name, counter: 1 },
    update: { counter: { increment: 1 } },
  });
  const padded = String(row.counter).padStart(width, "0");
  return { counter: row.counter, formatted: `${args.prefix}${padded}` };
}

/**
 * Convenience wrapper for the Quotes module: `QT-YYYY-NNNN` keyed off the
 * issue date. Reuse this everywhere quote numbers are minted so the format
 * stays consistent across routes.
 */
export async function nextQuoteNumber(
  tx: DbClient,
  tenantId: string,
  issueDate: Date = new Date(),
): Promise<string> {
  const year = issueDate.getUTCFullYear();
  const { formatted } = await nextFormattedNumber(tx, {
    tenantId,
    name: `quote-${year}`,
    prefix: `QT-${year}-`,
    width: 4,
  });
  return formatted;
}
