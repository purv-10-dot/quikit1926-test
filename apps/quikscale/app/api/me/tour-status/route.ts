import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const VIEW_KEY = "qs:tour-completed";

export const GET = withOrgAuth(async ({ orgId, userId }) => {
  const row = await db.qsUserViewPref.findFirst({
    where: { orgId, userId, viewKey: VIEW_KEY },
    select: { id: true },
  });
  return NextResponse.json({ success: true, data: { completed: !!row } });
});

export const POST = withOrgAuth(async ({ orgId, userId }) => {
  const existing = await db.qsUserViewPref.findFirst({
    where: { orgId, userId, viewKey: VIEW_KEY },
    select: { id: true },
  });
  if (!existing) {
    await db.qsUserViewPref.create({
      data: { orgId, userId, viewKey: VIEW_KEY },
    });
  }
  return NextResponse.json({ success: true, data: { completed: true } });
});
