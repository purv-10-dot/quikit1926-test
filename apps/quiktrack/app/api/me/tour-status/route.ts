import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const VIEW_KEY = "qt:tour-completed";

export const GET = withOrgAuth(async ({ orgId, userId }) => {
  const row = await db.qtUserViewPref.findFirst({
    where: { orgId, userId, viewKey: VIEW_KEY, projectId: null },
    select: { id: true },
  });
  return NextResponse.json({ success: true, data: { completed: !!row } });
});

export const POST = withOrgAuth(async ({ orgId, userId }) => {
  const existing = await db.qtUserViewPref.findFirst({
    where: { orgId, userId, viewKey: VIEW_KEY, projectId: null },
    select: { id: true },
  });
  if (!existing) {
    await db.qtUserViewPref.create({
      data: { orgId, userId, viewKey: VIEW_KEY, projectId: null },
    });
  }
  return NextResponse.json({ success: true, data: { completed: true } });
});
