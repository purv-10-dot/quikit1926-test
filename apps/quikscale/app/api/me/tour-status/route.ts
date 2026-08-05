import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

/**
 * Onboarding-tour completion flag for the signed-in user in their active org.
 *
 * Stored as row-existence in the generic `QsUserViewPref` table (no boolean
 * column): present = completed. The client treats this endpoint as the single
 * source of truth and fails closed on any error, so a 500 here suppresses the
 * tour rather than replaying it on every login.
 */
const VIEW_KEY = "qs:tour-completed";

export const GET = withOrgAuth(
  async ({ orgId, userId }) => {
    const row = await db.qsUserViewPref.findFirst({
      where: { orgId, userId, viewKey: VIEW_KEY },
      select: { id: true },
    });
    return NextResponse.json({ success: true, data: { completed: !!row } });
  },
  { fallbackErrorMessage: "Failed to read tour status" },
);

/**
 * Mark the tour complete. Idempotent via the `(userId, orgId, viewKey)` unique
 * index — an upsert rather than find-then-create so two tabs finishing at once
 * can't race into a duplicate-key error.
 */
export const POST = withOrgAuth(
  async ({ orgId, userId }) => {
    await db.qsUserViewPref.upsert({
      where: { userId_orgId_viewKey: { userId, orgId, viewKey: VIEW_KEY } },
      create: { orgId, userId, viewKey: VIEW_KEY },
      update: {},
    });
    return NextResponse.json({ success: true, data: { completed: true } });
  },
  { fallbackErrorMessage: "Failed to save tour status" },
);

/** Reset the flag so the tour runs again ("Take the tour again"). */
export const DELETE = withOrgAuth(
  async ({ orgId, userId }) => {
    await db.qsUserViewPref.deleteMany({
      where: { orgId, userId, viewKey: VIEW_KEY },
    });
    return NextResponse.json({ success: true, data: { completed: false } });
  },
  { fallbackErrorMessage: "Failed to reset tour status" },
);
