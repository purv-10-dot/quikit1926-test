/**
 * SA-C.3 — Acknowledge an alert (keeps it visible but marks the decision).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/requireSuperAdmin";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;
  try {
    const updated = await db.platformAlert.update({
      where: { id: params.id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: auth.userId,
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to acknowledge";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
