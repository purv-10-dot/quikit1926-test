/**
 * SA-C.3 — List open alerts (for the Analytics dashboard).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/requireSuperAdmin";

export async function GET() {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  try {
    const open = await db.platformAlert.findMany({
      where: { resolvedAt: null },
      orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
      take: 50,
    });
    return NextResponse.json({
      success: true,
      data: open.map((a) => ({
        ...a,
        firstSeenAt: a.firstSeenAt.toISOString(),
        lastSeenAt: a.lastSeenAt.toISOString(),
        acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load alerts";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
