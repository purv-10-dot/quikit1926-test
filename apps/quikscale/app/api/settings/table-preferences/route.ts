import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  TABLE_PREFERENCE_KEYS,
  type TablePreferenceKey,
  updateTablePreferencesSchema,
} from "@/lib/schemas/tablePreferencesSchema";
import { validationError } from "@/lib/api/validationError";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

/**
 * Per-user table column preferences (sort / hidden / frozen / col widths).
 *
 * Storage moved from `auth.User.kpi[Field]` / `priority[Field]` / `www[Field]`
 * columns into a dedicated `app_quikscale.UserTablePreference` table on
 * 2026-05-27 so the shared User model stops growing every time we add a new
 * QuikScale list page. The legacy User columns were backfilled in migration
 * `20260527172915_user_table_preference` and now sit idle for rollback.
 */

function parseHidden(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseWidths(json: string | null | undefined): Record<string, number> {
  if (!json) return {};
  try {
    const obj = JSON.parse(json);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const result: Record<string, number> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "number") result[k] = v;
      }
      return result;
    }
    return {};
  } catch {
    return {};
  }
}

// Column order is a JSON-stringified string[]. Same defensive parse as
// hiddenCols — malformed / legacy-null rows come back as [] (default order).
function parseOrder(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

interface TablePrefShape {
  frozenCol: string | null;
  hiddenCols: string[];
  sort: string | null;
  colWidths: Record<string, number>;
  colOrder: string[];
}

const EMPTY: TablePrefShape = { frozenCol: null, hiddenCols: [], sort: null, colWidths: {}, colOrder: [] };

// GET /api/settings/table-preferences — returns one entry per supported table
// key. Tables the user hasn't customized yet come back as EMPTY defaults so
// the client doesn't have to special-case "first visit".
export const GET = withOrgAuth(async ({ userId, orgId }) => {
  const rows = await db.userTablePreference.findMany({
    where: { userId, orgId },
    select: {
      tableName: true,
      frozenCol: true,
      hiddenCols: true,
      sort: true,
      colWidths: true,
      colOrder: true,
    },
  });

  const byName = new Map<string, TablePrefShape>();
  for (const r of rows) {
    byName.set(r.tableName, {
      frozenCol: r.frozenCol,
      hiddenCols: parseHidden(r.hiddenCols),
      sort: r.sort,
      colWidths: parseWidths(r.colWidths),
      colOrder: parseOrder(r.colOrder),
    });
  }

  const data: Record<TablePreferenceKey, TablePrefShape> = Object.fromEntries(
    TABLE_PREFERENCE_KEYS.map((key) => [key, byName.get(key) ?? EMPTY]),
  ) as Record<TablePreferenceKey, TablePrefShape>;

  return NextResponse.json({ success: true, data });
}, { fallbackErrorMessage: "Failed to fetch preferences" });

// PATCH /api/settings/table-preferences — upsert one table's prefs. Only the
// keys present in the request body are updated; everything else is preserved
// on the row.
export const PATCH = withOrgAuth(async ({ userId, orgId }, request) => {
  const body = await request.json();
  const parsed = updateTablePreferencesSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const { table, frozenCol, hiddenCols, sort, colWidths, colOrder } = parsed.data;

  // Build a partial update payload — only fields explicitly present.
  const updateData: Record<string, string | null> = {};
  if (frozenCol !== undefined) updateData.frozenCol = frozenCol;
  if (hiddenCols !== undefined) {
    updateData.hiddenCols = hiddenCols ? JSON.stringify(hiddenCols) : null;
  }
  if (sort !== undefined) updateData.sort = sort;
  if (colWidths !== undefined) {
    updateData.colWidths = colWidths ? JSON.stringify(colWidths) : null;
  }
  if (colOrder !== undefined) {
    updateData.colOrder = colOrder ? JSON.stringify(colOrder) : null;
  }

  // On first touch for this (user, org, table) the row doesn't exist yet —
  // upsert handles both branches in one round trip. The CREATE branch mirrors
  // the UPDATE so partial PATCHes (e.g. set only `sort`) leave the unset
  // fields as null rather than defaulting them.
  await db.userTablePreference.upsert({
    where: {
      userId_orgId_tableName: { userId, orgId, tableName: table },
    },
    update: updateData,
    create: {
      userId,
      orgId,
      tableName: table,
      frozenCol: frozenCol ?? null,
      hiddenCols: hiddenCols ? JSON.stringify(hiddenCols) : null,
      sort: sort ?? null,
      colWidths: colWidths ? JSON.stringify(colWidths) : null,
      colOrder: colOrder ? JSON.stringify(colOrder) : null,
    },
  });

  return NextResponse.json({
    success: true,
    data: { table, frozenCol, hiddenCols, sort, colWidths, colOrder },
  });
}, { fallbackErrorMessage: "Failed to update preferences" });
