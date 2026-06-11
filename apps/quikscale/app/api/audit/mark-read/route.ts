import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("kpi");

/**
 * POST /api/audit/mark-read  body: { entityType, entityId }
 *
 * Upserts the current user's high-water read mark for an entity's audit
 * timeline to "now". Idempotent per (user, entityType, entityId). Gated by KPI
 * module access (KPI-only scope for now).
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const entityType = typeof body?.entityType === "string" ? body.entityType.trim() : "";
  const entityId = typeof body?.entityId === "string" ? body.entityId.trim() : "";
  if (!entityType || !entityId) {
    return NextResponse.json(
      { success: false, error: "entityType and entityId are required" },
      { status: 400 },
    );
  }

  const now = new Date();
  const mark = await db.auditEventRead.upsert({
    where: { userId_entityType_entityId: { userId, entityType, entityId } },
    update: { lastReadAt: now },
    create: { orgId, userId, entityType, entityId, lastReadAt: now },
    select: { lastReadAt: true },
  });

  return NextResponse.json({ success: true, data: { lastReadAt: mark.lastReadAt } });
}, { fallbackErrorMessage: "Failed to mark audit timeline as read" });
