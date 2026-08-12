/**
 * Account row reads with fallback when `tags` is not yet on the Prisma client or DB.
 * Migration: packages/database/prisma/migrations/20260526140000_crm_account_tags
 */

import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { toAccountRow, type AccountRow } from "./index";

export const ACCOUNT_ROW_SELECT_BASE = {
  id: true,
  name: true,
  segment: true,
  segmentEnum: true,
  ownerId: true,
  ownerName: true,
  annualRevenueDisplay: true,
  annualRevenueAmount: true,
  annualRevenueCurrency: true,
  status: true,
  industry: true,
  industryKey: true,
  website: true,
  city: true,
  countryCode: true,
  state: true,
  postalCode: true,
  parentAccountId: true,
  healthScore: true,
  npsScore: true,
  contractStart: true,
  contractEnd: true,
  renewalDate: true,
  defaultPriceListId: true,
  deletedAt: true,
} as const satisfies Prisma.QceAccountSelect;

/** Full select including tags (requires migration + `prisma generate`). */
export const ACCOUNT_ROW_SELECT = {
  ...ACCOUNT_ROW_SELECT_BASE,
  tags: true,
} as const;

type RowFromSelect<S extends Prisma.QceAccountSelect> = Prisma.QceAccountGetPayload<{
  select: S;
}>;

function isMissingAccountTagsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("tags") &&
    (msg.includes("unknown field") ||
      msg.includes("unknown argument") ||
      msg.includes("does not exist") ||
      msg.includes("unknown column") ||
      (msg.includes("column") && msg.includes("crmaccount")))
  );
}

type AccountRowSelectRow =
  | RowFromSelect<typeof ACCOUNT_ROW_SELECT>
  | RowFromSelect<typeof ACCOUNT_ROW_SELECT_BASE>;

function mapRow(row: AccountRowSelectRow): AccountRow {
  const withTags = row as RowFromSelect<typeof ACCOUNT_ROW_SELECT> & { tags?: string[] };
  return toAccountRow({
    ...withTags,
    tags: withTags.tags ?? [],
  });
}

export async function findFirstAccountRow(
  args: Omit<Prisma.QceAccountFindFirstArgs, "select">,
): Promise<AccountRow | null> {
  try {
    const row = await prisma.qceAccount.findFirst({
      ...args,
      select: ACCOUNT_ROW_SELECT,
    });
    return row ? mapRow(row) : null;
  } catch (err) {
    if (!isMissingAccountTagsError(err)) throw err;
    console.warn(
      "[accounts] tags column unavailable — reading without labels. Apply migration " +
        "packages/database/prisma/migrations/20260526140000_crm_account_tags and run prisma generate.",
    );
    const row = await prisma.qceAccount.findFirst({
      ...args,
      select: ACCOUNT_ROW_SELECT_BASE,
    });
    return row ? mapRow(row) : null;
  }
}

export async function findManyAccountRows(
  args: Omit<Prisma.QceAccountFindManyArgs, "select">,
): Promise<AccountRow[]> {
  try {
    const rows = await prisma.qceAccount.findMany({
      ...args,
      select: ACCOUNT_ROW_SELECT,
    });
    return rows.map((r) => mapRow(r));
  } catch (err) {
    if (!isMissingAccountTagsError(err)) throw err;
    console.warn("[accounts] tags column unavailable — list without labels.");
    const rows = await prisma.qceAccount.findMany({
      ...args,
      select: ACCOUNT_ROW_SELECT_BASE,
    });
    return rows.map((r) => mapRow(r));
  }
}

export async function updateAccountRow(
  args: Omit<Prisma.QceAccountUpdateArgs, "select">,
): Promise<AccountRow> {
  try {
    const row = await prisma.qceAccount.update({
      ...args,
      select: ACCOUNT_ROW_SELECT,
    });
    return mapRow(row);
  } catch (err) {
    if (!isMissingAccountTagsError(err)) throw err;
    const data = { ...(args.data as Record<string, unknown>) };
    delete data.tags;
    console.warn("[accounts] tags column unavailable — update without labels.");
    const row = await prisma.qceAccount.update({
      ...args,
      data: data as Prisma.QceAccountUpdateInput,
      select: ACCOUNT_ROW_SELECT_BASE,
    });
    return mapRow(row);
  }
}

export async function createAccountRow(
  args: Omit<Prisma.QceAccountCreateArgs, "select">,
): Promise<AccountRow> {
  try {
    const row = await prisma.qceAccount.create({
      ...args,
      select: ACCOUNT_ROW_SELECT,
    });
    return mapRow(row);
  } catch (err) {
    if (!isMissingAccountTagsError(err)) throw err;
    const data = { ...(args.data as Record<string, unknown>) };
    delete data.tags;
    const row = await prisma.qceAccount.create({
      ...args,
      data: data as Prisma.QceAccountUncheckedCreateInput,
      select: ACCOUNT_ROW_SELECT_BASE,
    });
    return mapRow(row);
  }
}
