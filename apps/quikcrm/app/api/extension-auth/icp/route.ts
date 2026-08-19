import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyExtensionToken } from "@/lib/auth/extension-token";

export const runtime = "nodejs";

/**
 * GET /api/extension-auth/icp?orgId=<id>
 *
 * ACTIVE Ideal Customer Profiles for the extension's ICP dropdown.
 *
 * Why this lives under /api/extension-auth rather than reusing
 * /api/icp/options: the extension carries a Bearer JWT (minted by
 * /api/extension-auth/callback), not the app's session cookie, so the
 * cookie-session guards used by /api/icp/* would 401 it. Auth + the org
 * membership check are cloned from /api/extension-auth/organizations, which
 * solves exactly this problem for the org list.
 *
 * `orgId` is optional and mirrors POST /api/leads/from-linkedin: honoured only
 * when the caller is an active member of it, otherwise we fall back to their
 * first active membership. That keeps the dropdown's org and the subsequent
 * save's org in agreement without the extension having to reason about it.
 *
 * Only `isActive: true` and non-deleted profiles are returned — the requirement
 * is explicitly "load only Active ICPs".
 */
export async function GET(request: NextRequest) {
  try {
    const nextAuthSecret = process.env.NEXTAUTH_SECRET;
    if (!nextAuthSecret) {
      return NextResponse.json(
        { success: false, error: "Server misconfigured" },
        { status: 500 },
      );
    }

    const extUser = await verifyExtensionToken(request);
    if (!extUser) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // `new URL(request.url)` rather than `request.nextUrl`: the latter is only
    // populated by the Next runtime, so a directly-constructed Request (route
    // tests, internal calls) would throw. Matches POST /api/leads/from-linkedin.
    const { searchParams } = new URL(request.url);
    const requestedOrgId = searchParams.get("orgId")?.trim() || "";

    let orgId = requestedOrgId;
    if (orgId) {
      const membership = await db.orgMember.findFirst({
        where: { userId: extUser.userId, orgId, status: "active", org: { status: "active" } },
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

    const rows = await db.crmIcpProfile.findMany({
      where: { orgId, isActive: true, deletedAt: null },
      select: { id: true, name: true, segment: true },
      orderBy: { name: "asc" },
      // The dropdown filters client-side; cap the payload so a large org can't
      // bloat the side panel. Matches the ICP options feed's own cap.
      take: 1000,
    });

    return NextResponse.json({
      success: true,
      data: { orgId, icps: rows },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    console.error("[api] GET /api/extension-auth/icp", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
