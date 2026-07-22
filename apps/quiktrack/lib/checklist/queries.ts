import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Raw-SQL data layer for the personal checklist (QtChecklistItem /
 * QtChecklistStatus). We use raw SQL because the generated Prisma client can't
 * be regenerated locally while the dev server holds the query-engine DLL, so it
 * doesn't yet know these new models — same pattern as QtUserActivity. Every
 * query is scoped to (orgId, userId): a checklist is private to its owner.
 */

const STATUS_TBL = Prisma.sql`"app_quiktrack"."QtChecklistStatus"`;
const ITEM_TBL = Prisma.sql`"app_quiktrack"."QtChecklistItem"`;

export interface ChecklistStatusRow {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
  isDefault: boolean;
}

export interface ChecklistItemRow {
  id: string;
  name: string;
  statusId: string | null;
  dueDate: Date | null;
  isCompleted: boolean;
  orderIndex: number;
  reminderSentAt: Date | null;
}

const DEFAULT_STATUSES: { name: string; color: string; isDefault: boolean }[] = [
  { name: "To do", color: "#6b7280", isDefault: true },
  { name: "In progress", color: "#2563eb", isDefault: false },
  { name: "Done", color: "#16a34a", isDefault: false },
];

/* ───────────────────────────── Statuses ───────────────────────────── */

export async function listStatuses(orgId: string, userId: string): Promise<ChecklistStatusRow[]> {
  return db.$queryRaw<ChecklistStatusRow[]>`
    SELECT "id", "name", "color", "orderIndex", "isDefault"
    FROM ${STATUS_TBL}
    WHERE "orgId" = ${orgId} AND "userId" = ${userId} AND "isDeleted" = false
    ORDER BY "orderIndex" ASC, "createdAt" ASC
  `;
}

/** Seed the default status set the first time a user opens their checklist. */
export async function seedDefaultStatusesIfNone(orgId: string, userId: string): Promise<void> {
  const countRows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM ${STATUS_TBL}
    WHERE "orgId" = ${orgId} AND "userId" = ${userId} AND "isDeleted" = false
  `;
  if (Number(countRows[0]?.count ?? 0) > 0) return;
  for (let i = 0; i < DEFAULT_STATUSES.length; i++) {
    const s = DEFAULT_STATUSES[i];
    await db.$executeRaw`
      INSERT INTO ${STATUS_TBL}
        ("id", "orgId", "userId", "name", "color", "orderIndex", "isDefault", "updatedAt")
      VALUES (${`cst_${randomUUID()}`}, ${orgId}, ${userId}, ${s.name}, ${s.color}, ${i}, ${s.isDefault}, now())
    `;
  }
}

export async function createStatus(
  orgId: string,
  userId: string,
  name: string,
  color: string,
): Promise<ChecklistStatusRow> {
  const maxRows = await db.$queryRaw<{ max: number | null }[]>`
    SELECT MAX("orderIndex") AS max FROM ${STATUS_TBL}
    WHERE "orgId" = ${orgId} AND "userId" = ${userId} AND "isDeleted" = false
  `;
  const id = `cst_${randomUUID()}`;
  const orderIndex = (maxRows[0]?.max ?? -1) + 1;
  await db.$executeRaw`
    INSERT INTO ${STATUS_TBL}
      ("id", "orgId", "userId", "name", "color", "orderIndex", "updatedAt")
    VALUES (${id}, ${orgId}, ${userId}, ${name}, ${color}, ${orderIndex}, now())
  `;
  return { id, name, color, orderIndex, isDefault: false };
}

/** Returns the number of rows updated (0 = not found / not owned). */
export async function updateStatus(
  orgId: string,
  userId: string,
  statusId: string,
  fields: { name?: string; color?: string; orderIndex?: number },
): Promise<number> {
  const sets: Prisma.Sql[] = [];
  if (fields.name !== undefined) sets.push(Prisma.sql`"name" = ${fields.name}`);
  if (fields.color !== undefined) sets.push(Prisma.sql`"color" = ${fields.color}`);
  if (fields.orderIndex !== undefined) sets.push(Prisma.sql`"orderIndex" = ${fields.orderIndex}`);
  sets.push(Prisma.sql`"updatedAt" = now()`);
  return db.$executeRaw(Prisma.sql`
    UPDATE ${STATUS_TBL} SET ${Prisma.join(sets)}
    WHERE "id" = ${statusId} AND "orgId" = ${orgId} AND "userId" = ${userId} AND "isDeleted" = false
  `);
}

/** Soft-delete a status and detach it from any items (statusId → NULL). */
export async function softDeleteStatus(orgId: string, userId: string, statusId: string): Promise<number> {
  const n = await db.$executeRaw`
    UPDATE ${STATUS_TBL} SET "isDeleted" = true, "updatedAt" = now()
    WHERE "id" = ${statusId} AND "orgId" = ${orgId} AND "userId" = ${userId} AND "isDeleted" = false
  `;
  if (n > 0) {
    await db.$executeRaw`
      UPDATE ${ITEM_TBL} SET "statusId" = NULL, "updatedAt" = now()
      WHERE "statusId" = ${statusId} AND "orgId" = ${orgId} AND "userId" = ${userId}
    `;
  }
  return n;
}

/* ────────────────────────────── Items ─────────────────────────────── */

/**
 * One page of the caller's items. Fetches limit+1 to detect `hasMore` without a
 * second count query. Ordered unchecked-first, then by manual order.
 */
export async function listItems(
  orgId: string,
  userId: string,
  limit: number,
  offset: number,
): Promise<{ items: ChecklistItemRow[]; hasMore: boolean }> {
  const rows = await db.$queryRaw<ChecklistItemRow[]>`
    SELECT "id", "name", "statusId", "dueDate", "isCompleted", "orderIndex", "reminderSentAt"
    FROM ${ITEM_TBL}
    WHERE "orgId" = ${orgId} AND "userId" = ${userId} AND "isDeleted" = false
    ORDER BY "isCompleted" ASC, "orderIndex" ASC, "createdAt" ASC
    LIMIT ${limit + 1} OFFSET ${offset}
  `;
  const hasMore = rows.length > limit;
  return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/** Total + checked counts (whole list) so the header stays accurate under pagination. */
export async function countItems(orgId: string, userId: string): Promise<{ total: number; checked: number }> {
  const rows = await db.$queryRaw<{ total: bigint; checked: bigint }[]>`
    SELECT COUNT(*)::bigint AS total,
           COUNT(*) FILTER (WHERE "isCompleted")::bigint AS checked
    FROM ${ITEM_TBL}
    WHERE "orgId" = ${orgId} AND "userId" = ${userId} AND "isDeleted" = false
  `;
  return { total: Number(rows[0]?.total ?? 0), checked: Number(rows[0]?.checked ?? 0) };
}

export async function createItem(
  orgId: string,
  userId: string,
  input: { name: string; statusId?: string | null; dueDate?: string | null },
): Promise<ChecklistItemRow> {
  const maxRows = await db.$queryRaw<{ max: number | null }[]>`
    SELECT MAX("orderIndex") AS max FROM ${ITEM_TBL}
    WHERE "orgId" = ${orgId} AND "userId" = ${userId} AND "isDeleted" = false
  `;
  // Fall back to the user's default status when none is supplied.
  let statusId = input.statusId ?? null;
  if (statusId === null) {
    const def = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM ${STATUS_TBL}
      WHERE "orgId" = ${orgId} AND "userId" = ${userId} AND "isDeleted" = false AND "isDefault" = true
      LIMIT 1
    `;
    statusId = def[0]?.id ?? null;
  }
  const id = `chk_${randomUUID()}`;
  const orderIndex = (maxRows[0]?.max ?? -1) + 1;
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  await db.$executeRaw`
    INSERT INTO ${ITEM_TBL}
      ("id", "orgId", "userId", "name", "statusId", "dueDate", "orderIndex", "updatedAt")
    VALUES (${id}, ${orgId}, ${userId}, ${input.name}, ${statusId}, ${dueDate}, ${orderIndex}, now())
  `;
  return { id, name: input.name, statusId, dueDate, isCompleted: false, orderIndex, reminderSentAt: null };
}

export async function updateItem(
  orgId: string,
  userId: string,
  itemId: string,
  fields: {
    name?: string;
    statusId?: string | null;
    dueDate?: string | null;
    isCompleted?: boolean;
    orderIndex?: number;
  },
): Promise<number> {
  const sets: Prisma.Sql[] = [];
  if (fields.name !== undefined) sets.push(Prisma.sql`"name" = ${fields.name}`);
  if (fields.statusId !== undefined) sets.push(Prisma.sql`"statusId" = ${fields.statusId}`);
  if (fields.isCompleted !== undefined) sets.push(Prisma.sql`"isCompleted" = ${fields.isCompleted}`);
  if (fields.orderIndex !== undefined) sets.push(Prisma.sql`"orderIndex" = ${fields.orderIndex}`);
  if (fields.dueDate !== undefined) {
    const due = fields.dueDate ? new Date(fields.dueDate) : null;
    sets.push(Prisma.sql`"dueDate" = ${due}`);
    // Changing the due date re-arms the reminder so it can fire for the new date.
    sets.push(Prisma.sql`"reminderSentAt" = NULL`);
  }
  sets.push(Prisma.sql`"updatedAt" = now()`);
  return db.$executeRaw(Prisma.sql`
    UPDATE ${ITEM_TBL} SET ${Prisma.join(sets)}
    WHERE "id" = ${itemId} AND "orgId" = ${orgId} AND "userId" = ${userId} AND "isDeleted" = false
  `);
}

export async function softDeleteItem(orgId: string, userId: string, itemId: string): Promise<number> {
  return db.$executeRaw`
    UPDATE ${ITEM_TBL} SET "isDeleted" = true, "updatedAt" = now()
    WHERE "id" = ${itemId} AND "orgId" = ${orgId} AND "userId" = ${userId} AND "isDeleted" = false
  `;
}

/* ─────────────────────────── Reminders ────────────────────────────── */

/**
 * Turn the caller's now-due checklist items into in-app notifications. Called
 * from the notifications poll (no cron). Idempotent + concurrency-safe: each
 * item is *claimed* by stamping reminderSentAt in a guarded UPDATE, and only the
 * caller that wins the claim creates the notification. Returns the count fired.
 */
export async function materializeDueChecklistReminders(orgId: string, userId: string): Promise<number> {
  const due = await db.$queryRaw<{ id: string; name: string }[]>`
    SELECT "id", "name" FROM ${ITEM_TBL}
    WHERE "orgId" = ${orgId} AND "userId" = ${userId}
      AND "isDeleted" = false AND "isCompleted" = false
      AND "reminderSentAt" IS NULL AND "dueDate" IS NOT NULL AND "dueDate" <= now()
    ORDER BY "dueDate" ASC
    LIMIT 50
  `;
  let fired = 0;
  for (const item of due) {
    const claimed = await db.$executeRaw`
      UPDATE ${ITEM_TBL} SET "reminderSentAt" = now(), "updatedAt" = now()
      WHERE "id" = ${item.id} AND "reminderSentAt" IS NULL
    `;
    if (claimed !== 1) continue; // another poll already handled it
    await db.qtNotification.create({
      data: {
        orgId,
        recipientId: userId,
        type: "checklist_due",
        tab: "direct",
        snippet: `"${item.name}" is due`,
      },
    });
    fired++;
  }
  return fired;
}
