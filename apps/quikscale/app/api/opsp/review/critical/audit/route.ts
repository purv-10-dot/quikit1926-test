import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { isOrgAdmin, forbidden } from "@/lib/api/permissions";
import { resolveSectionUserId } from "@/lib/api/opspOwner";
import {
  CRITICAL_AUDIT_ENTITY_TYPE,
  parseCriticalEntityId,
} from "@/lib/audit/criticalFields";

/**
 * GET /api/opsp/review/critical/audit?entityId=<opspId>:<period>
 *
 * Full Change History timeline for ONE Critical # / Balancing Critical # card,
 * read from the centralized AuditEvent + AuditChange tables (the same system
 * KPI/Priority/WWW use). Mirrors /api/priority/[id]/audit, but takes the
 * composite entityId as a query param (it contains colons) and re-derives the
 * SAME per-card authorization the write route enforces:
 *
 *   - year / actions  → org-level criticals, admin only
 *   - people:<id>     → self, or another user with OPSP.EditUser:update
 *
 * Gated by OPSP.Review.Critical:view + the opsp.review feature flag, so a
 * critical-only (non-admin) reviewer can read their OWN card's history —
 * which the admin-gated /api/audit-logs endpoint never allowed.
 */
const critAuth = withOrgAuthForResource("opsp.review", "OPSP.Review.Critical");
const MAX_EVENTS = 500;

export const GET = critAuth.view(async ({ orgId, userId }, req) => {
  try {
    const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
    const parsed = parseCriticalEntityId(entityId);
    if (!parsed) {
      return NextResponse.json({ success: false, error: "Invalid entityId" }, { status: 400 });
    }

    // Tenant isolation: the card's OPSP must belong to this org. 404 (not 403)
    // so we never reveal whether an OPSP id exists in another org.
    const opsp = await db.oPSPData.findUnique({
      where: { id: parsed.opspId },
      select: { orgId: true },
    });
    if (!opsp || opsp.orgId !== orgId) {
      return NextResponse.json({ success: false, error: "Critical card not found" }, { status: 404 });
    }

    // Per-card authorization — mirrors POST /api/opsp/review/critical exactly.
    if (parsed.module === "people") {
      const allowed = await resolveSectionUserId(orgId, userId, parsed.subjectUserId);
      if (allowed === null) {
        return forbidden("Viewing another user's critical review requires the 'Edit Any User's OPSP' permission.");
      }
    } else {
      // year / actions are org-level strategic criticals — admin only.
      if (!(await isOrgAdmin(userId, orgId))) {
        return forbidden("Only an admin can view the org's Year/Quarter critical history.");
      }
    }

    const events = await db.auditEvent.findMany({
      where: { orgId, entityType: CRITICAL_AUDIT_ENTITY_TYPE, entityId },
      select: {
        id: true,
        action: true,
        actorUserId: true,
        actorName: true,
        source: true,
        reason: true,
        snapshot: true,
        createdAt: true,
        teamId: true,
        changes: { select: { fieldName: true, oldValue: true, newValue: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_EVENTS,
    });

    return NextResponse.json({
      success: true,
      data: events,
      meta: { total: events.length, capped: events.length === MAX_EVENTS },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch critical review audit history";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
