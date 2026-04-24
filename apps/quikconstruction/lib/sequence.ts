import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Atomic per-tenant sequential number generator.
 *
 * Usage:
 *   const num = await nextNumber({ tenantId, prefix: "INV", fy: "FY2526" });
 *   // "INV/FY2526/000042"
 *
 * Uses upsert + raw increment to avoid TOCTOU. Call inside a tx where
 * possible (pass `tx`) so the number is rolled back if the parent write fails.
 */
export async function nextNumber(args: {
  tenantId: string;
  prefix: string;
  fy?: string | null;
  pad?: number;
  separator?: string;
  tx?: Prisma.TransactionClient;
}): Promise<string> {
  const pad = args.pad ?? 6;
  const sep = args.separator ?? "/";
  // Prisma's compound-unique `where` requires a non-null value on every field
  // of the composite. We encode "no FY" as sentinel empty string on the column
  // so the unique index still enforces one-counter-per-(tenant,prefix,fy).
  const fyForStorage = args.fy ?? "";
  const client = args.tx ?? db;

  const row = await client.cnNumberSequence.upsert({
    where: { tenantId_prefix_fyKey: { tenantId: args.tenantId, prefix: args.prefix, fyKey: fyForStorage } },
    create: { tenantId: args.tenantId, prefix: args.prefix, fyKey: fyForStorage, counter: 1 },
    update: { counter: { increment: 1 } },
  });

  const padded = String(row.counter).padStart(pad, "0");
  return args.fy ? `${args.prefix}${sep}${args.fy}${sep}${padded}` : `${args.prefix}${sep}${padded}`;
}

/** Compute current Indian FY key from a date: "FY2526" for Apr 2025 – Mar 2026 */
export function fyKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-12
  const startYear = m >= 4 ? y : y - 1;
  const a = String(startYear).slice(-2);
  const b = String(startYear + 1).slice(-2);
  return `FY${a}${b}`;
}
