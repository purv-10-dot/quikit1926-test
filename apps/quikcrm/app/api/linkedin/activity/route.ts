import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyExtensionToken } from "@/lib/auth/extension-token";
import { logLinkedInActivity } from "@/lib/services/activities/log-linkedin-activity";
import { LINKEDIN_ACTIVITY_TYPE_VALUES } from "@/lib/services/activities/linkedin-activity-types";

export const runtime = "nodejs";

/**
 * POST /api/linkedin/activity
 *
 * Dedicated activity endpoint for the LinkedIn Chrome extension. Creates a
 * CrmActivity linked to an existing CrmProspect — it never creates the
 * prospect itself; the extension calls /api/leads/from-linkedin first (that
 * route already upserts on (orgId, linkedinUrl), so prospects are never
 * duplicated).
 *
 * Auth: the same Bearer JWT the rest of the extension surface uses, verified
 * with verifyExtensionToken. Org isolation is enforced twice — the caller must
 * be an active member of the resolved org, and the prospect must belong to
 * that same org.
 *
 * Generic over the LINKEDIN_ACTIVITY_TYPES registry, so future actions
 * (LINKEDIN_MESSAGE_SENT, LINKEDIN_CONNECTION_ACCEPTED, …) are already accepted
 * here without a code change to this file.
 *
 * Idempotent: replays collapse onto the
 * (orgId, sourceSystem, externalId) unique index rather than creating a second
 * timeline row. Re-clicking Connect for the same prospect returns
 * `duplicate: true` with the original activity id.
 */
const linkedinActivitySchema = z.object({
  orgId: z.string().min(1).optional(),
  prospectId: z.string().min(1),
  activityType: z.enum(LINKEDIN_ACTIVITY_TYPE_VALUES),
  linkedinProfileUrl: z.string().trim().optional(),
  profileName: z.string().trim().optional(),
  company: z.string().trim().optional(),
  // ISO-8601 instant the action occurred on the client. Defaults to now when
  // absent or unparseable — a bad clock must not fail the write.
  timestamp: z.string().trim().optional(),
});

function parseTimestamp(raw: string | undefined): Date {
  if (!raw) return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function POST(request: NextRequest) {
  try {
    const extUser = await verifyExtensionToken(request);
    if (!extUser) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = linkedinActivitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // Resolve the target org exactly as /api/leads/from-linkedin does: honor a
    // posted orgId only when the caller is an active member, else fall back to
    // their first active membership.
    let orgId = data.orgId?.trim() || "";
    if (orgId) {
      const membership = await db.orgMember.findFirst({
        where: {
          userId: extUser.userId,
          orgId,
          status: "active",
          org: { status: "active" },
        },
        select: { orgId: true },
      });
      if (!membership) {
        return NextResponse.json(
          { success: false, error: "Not a member of the selected organization" },
          { status: 403 },
        );
      }
    } else {
      const first = await db.orgMember.findFirst({
        where: { userId: extUser.userId, status: "active", org: { status: "active" } },
        select: { orgId: true },
        orderBy: { createdAt: "asc" },
      });
      if (!first) {
        return NextResponse.json(
          { success: false, error: "No active organization for this user" },
          { status: 403 },
        );
      }
      orgId = first.orgId;
    }

    const result = await logLinkedInActivity({
      orgId,
      userId: extUser.userId,
      initiatedBy: extUser.name || extUser.email || extUser.userId,
      prospectId: data.prospectId,
      activityType: data.activityType,
      linkedinProfileUrl: data.linkedinProfileUrl,
      profileName: data.profileName,
      company: data.company,
      occurredAt: parseTimestamp(data.timestamp),
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: { activityId: result.activityId, duplicate: result.duplicate },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    console.error("[api] POST /api/linkedin/activity", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
