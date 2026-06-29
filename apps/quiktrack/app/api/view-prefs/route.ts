import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

/**
 * Structured backlog "View settings" blob. Strictly shaped so the DB only
 * ever stores clean data, not arbitrary JSON. `.partial()` keeps it
 * forward-compatible — clients may PUT a subset and the server merges.
 */
const backlogSettingsSchema = z
  .object({
    epicPanel: z.boolean(),
    emptySprints: z.boolean(),
    density: z.enum(["default", "compact"]),
    fields: z
      .object({
        workType: z.boolean(),
        key: z.boolean(),
        epic: z.boolean(),
        status: z.boolean(),
        assignee: z.boolean(),
      })
      .partial(),
  })
  .partial();

const upsertSchema = z.object({
  viewKey: z.string().min(1).max(60),
  projectId: z.string().min(1).nullable().optional(),
  // Column prefs are optional now so a settings-only PUT (or a column-only
  // PUT) writes only what it carries and never clobbers the other concern.
  hiddenColumns: z.array(z.string()).optional(),
  columnOrder: z.array(z.string()).optional(),
  settings: backlogSettingsSchema.optional(),
  // Auto-persisted filter state for this surface. Shape varies per view
  // (list/board/backlog/grouped-kanban/global), so it's a free-form object;
  // `null` clears it. Independent of column/settings prefs — a filters-only PUT
  // never clobbers them (and vice versa).
  filters: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const viewKey = url.searchParams.get("viewKey");
  const projectId = url.searchParams.get("projectId") || null;
  if (!viewKey) {
    return NextResponse.json(
      { success: false, error: "viewKey is required" },
      { status: 400 },
    );
  }
  const pref = await db.qtUserViewPref.findFirst({
    where: { orgId: orgId, userId, viewKey, projectId },
  });
  if (!pref) {
    return NextResponse.json({
      success: true,
      data: { hiddenColumns: [], columnOrder: [], settings: null, filters: null },
    });
  }
  // `filters` is read via raw SQL — the generated Prisma client can be stale on
  // this column on Windows (DLL-lock on `prisma generate`), the same reason the
  // docs routes use raw SQL.
  const fRows = await db.$queryRaw<{ filters: unknown }[]>`
    SELECT filters FROM app_quiktrack."QtUserViewPref" WHERE id = ${pref.id} LIMIT 1
  `;
  return NextResponse.json({
    success: true,
    data: { ...pref, filters: fRows[0]?.filters ?? null },
  });
});

export const PUT = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = upsertSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const projectId = parsed.data.projectId ?? null;
  const { hiddenColumns, columnOrder, settings, filters } = parsed.data;

  // Build the patch from only the fields the request actually carried, so a
  // settings-only PUT leaves column prefs untouched (and vice versa). `filters`
  // is handled separately via raw SQL (below) because the generated Prisma
  // client can be stale on that column.
  const data: {
    hiddenColumns?: string[];
    columnOrder?: string[];
    settings?: typeof settings;
  } = {};
  if (hiddenColumns !== undefined) data.hiddenColumns = hiddenColumns;
  if (columnOrder !== undefined) data.columnOrder = columnOrder;
  if (settings !== undefined) data.settings = settings;

  const existing = await db.qtUserViewPref.findFirst({
    where: { orgId: orgId, userId, viewKey: parsed.data.viewKey, projectId },
    select: { id: true },
  });
  const pref = existing
    ? await db.qtUserViewPref.update({
        where: { id: existing.id },
        data,
      })
    : await db.qtUserViewPref.create({
        data: {
          orgId: orgId,
          userId,
          viewKey: parsed.data.viewKey,
          projectId,
          hiddenColumns: hiddenColumns ?? [],
          columnOrder: columnOrder ?? [],
          settings: settings ?? undefined,
        },
      });

  // Persist filters via raw SQL (null clears it → stored as an empty object).
  let filtersOut: unknown;
  if (filters !== undefined) {
    const json = JSON.stringify(filters ?? {});
    await db.$executeRaw`
      UPDATE app_quiktrack."QtUserViewPref"
      SET filters = ${json}::jsonb, "updatedAt" = NOW()
      WHERE id = ${pref.id}
    `;
    filtersOut = filters ?? {};
  }

  return NextResponse.json({
    success: true,
    data: filters !== undefined ? { ...pref, filters: filtersOut } : pref,
  });
});
