import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateTablePreferencesSchema } from "@/lib/schemas/tablePreferencesSchema";

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
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch preferences";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH /api/settings/table-preferences — update one or more fields for a table
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateTablePreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }

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
      where: { id: session.user.id },
      data,
    });

    return NextResponse.json({ success: true, data: { table, frozenCol, hiddenCols, sort, colWidths } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update preferences";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
