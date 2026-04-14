import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateTablePreferencesSchema } from "@/lib/schemas/tablePreferencesSchema";
import { validationError } from "@/lib/api/validationError";
import { withTenantAuth } from "@/lib/api/withTenantAuth";

function parseHidden(json: string | null): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseWidths(json: string | null): Record<string, number> {
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

// GET /api/settings/table-preferences — return all table prefs for the current user
export const GET = withTenantAuth(async ({ userId }) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        kpiFrozenCol: true,
        priorityFrozenCol: true,
        wwwFrozenCol: true,
        kpiHiddenCols: true,
        priorityHiddenCols: true,
        wwwHiddenCols: true,
        kpiSort: true,
        prioritySort: true,
        wwwSort: true,
        kpiColWidths: true,
        priorityColWidths: true,
        wwwColWidths: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        kpi: {
          frozenCol: user?.kpiFrozenCol ?? null,
          hiddenCols: parseHidden(user?.kpiHiddenCols ?? null),
          sort: user?.kpiSort ?? null,
          colWidths: parseWidths(user?.kpiColWidths ?? null),
        },
        priority: {
          frozenCol: user?.priorityFrozenCol ?? null,
          hiddenCols: parseHidden(user?.priorityHiddenCols ?? null),
          sort: user?.prioritySort ?? null,
          colWidths: parseWidths(user?.priorityColWidths ?? null),
        },
        www: {
          frozenCol: user?.wwwFrozenCol ?? null,
          hiddenCols: parseHidden(user?.wwwHiddenCols ?? null),
          sort: user?.wwwSort ?? null,
          colWidths: parseWidths(user?.wwwColWidths ?? null),
        },
      },
    });
}, { fallbackErrorMessage: "Failed to fetch preferences" });

// PATCH /api/settings/table-preferences — update one or more fields for a table
export const PATCH = withTenantAuth(async ({ userId }, request) => {
    const body = await request.json();
    const parsed = updateTablePreferencesSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed);

    const { table, frozenCol, hiddenCols, sort, colWidths } = parsed.data;
    const frozenField =
      table === "kpi" ? "kpiFrozenCol" :
      table === "priority" ? "priorityFrozenCol" : "wwwFrozenCol";
    const hiddenField =
      table === "kpi" ? "kpiHiddenCols" :
      table === "priority" ? "priorityHiddenCols" : "wwwHiddenCols";
    const sortField =
      table === "kpi" ? "kpiSort" :
      table === "priority" ? "prioritySort" : "wwwSort";
    const widthsField =
      table === "kpi" ? "kpiColWidths" :
      table === "priority" ? "priorityColWidths" : "wwwColWidths";

    const data: Record<string, string | null> = {};
    if (frozenCol !== undefined) data[frozenField] = frozenCol;
    if (hiddenCols !== undefined) data[hiddenField] = hiddenCols ? JSON.stringify(hiddenCols) : null;
    if (sort !== undefined) data[sortField] = sort;
    if (colWidths !== undefined) data[widthsField] = colWidths ? JSON.stringify(colWidths) : null;

    await db.user.update({
      where: { id: userId },
      data,
    });

    return NextResponse.json({ success: true, data: { table, frozenCol, hiddenCols, sort, colWidths } });
}, { fallbackErrorMessage: "Failed to update preferences" });
