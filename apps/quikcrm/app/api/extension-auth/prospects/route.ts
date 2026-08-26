import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyExtensionToken } from "@/lib/auth/extension-token";

export const runtime = "nodejs";

/**
 * GET /api/extension-auth/prospects?orgId=<id>&q=<search>
 *
 * Prospect list for the extension's "Select Prospect" dropdown.
 *
 * Why this exists rather than reusing /api/prospects/picker: that route guards
 * with `requireApiUser` → `getServerSession`, i.e. the app's session COOKIE.
 * The extension carries a Bearer JWT minted by /api/extension-auth/callback and
 * has no cookie, so the picker would 401 it. Auth and the org-membership
 * resolution here are cloned from /api/extension-auth/icp, which solves exactly
 * this problem for the ICP dropdown.
 *
 * `orgId` is optional and mirrors POST /api/leads/from-linkedin: honoured only
 * when the caller is an active member of it, otherwise we fall back to their
 * first active membership. That keeps the dropdown's org and the subsequent
 * save's org in agreement without the extension having to reason about it.
 *
 * `linkedinUrl` is returned because the extension matches the currently-open
 * LinkedIn profile against the selected prospect before allowing a save — the
 * mismatch guard that stops profile B's data being written onto prospect A.
 */
export async function GET(request: NextRequest) {
  try {
    const extUser = await verifyExtensionToken(request);
    if (!extUser) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // `new URL(request.url)` rather than `request.nextUrl`: the latter is only
    // populated by the Next runtime, so a directly-constructed Request (route
    // tests, internal calls) would throw. Matches the ICP route.
    const { searchParams } = new URL(request.url);
    const requestedOrgId = searchParams.get("orgId")?.trim() || "";
    const q = searchParams.get("q")?.trim() || "";

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

    const where: Record<string, unknown> = { orgId };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await db.crmProspect.findMany({
      where,
      // Only what the dropdown renders plus the URL the mismatch guard needs —
      // the heavy JSON blobs are fetched per-prospect by the detail route.
      select: {
        id: true,
        name: true,
        company: true,
        title: true,
        linkedinUrl: true,
      },
      orderBy: { createdAt: "desc" },
      // The dropdown filters client-side; cap the payload so a large org cannot
      // bloat the side panel. Same cap as the ICP feed.
      take: 1000,
    });

    return NextResponse.json({
      success: true,
      data: { orgId, prospects: rows },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    console.error("[api] GET /api/extension-auth/prospects", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
