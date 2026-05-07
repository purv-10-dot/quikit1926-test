import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const upsertSchema = z.object({
  viewKey: z.string().min(1).max(60),
  projectId: z.string().min(1).nullable().optional(),
  hiddenColumns: z.array(z.string()).default([]),
  columnOrder: z.array(z.string()).default([]),
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
  return NextResponse.json({
    success: true,
    data: pref ?? { hiddenColumns: [], columnOrder: [] },
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
  const existing = await db.qtUserViewPref.findFirst({
    where: { orgId: orgId, userId, viewKey: parsed.data.viewKey, projectId },
    select: { id: true },
  });
  const pref = existing
    ? await db.qtUserViewPref.update({
        where: { id: existing.id },
        data: {
          hiddenColumns: parsed.data.hiddenColumns,
          columnOrder: parsed.data.columnOrder,
        },
      })
    : await db.qtUserViewPref.create({
        data: {
          orgId: orgId,
          userId,
          viewKey: parsed.data.viewKey,
          projectId,
          hiddenColumns: parsed.data.hiddenColumns,
          columnOrder: parsed.data.columnOrder,
        },
      });
  return NextResponse.json({ success: true, data: pref });
});
