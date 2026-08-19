import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyExtensionToken } from "@/lib/auth/extension-token";

export const runtime = "nodejs";

/**
 * GET /api/extension-auth/prospects/<id>?orgId=<id>
 *
 * Full record for ONE prospect, for the extension's "Fetch Prospect Data"
 * action and the saved-conversation view.
 *
 * Bearer-JWT authed for the same reason as the sibling list route: the
 * extension has no session cookie, so the cookie-guarded /api/prospects/*
 * routes would 401 it. Auth + org resolution cloned from
 * /api/extension-auth/icp.
 *
 * The prospect is looked up by BOTH id and the resolved orgId, so a caller can
 * never read another organisation's prospect by guessing an id.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const extUser = await verifyExtensionToken(request);
    if (!extUser) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Prospect id is required" },
        { status: 400 },
      );
    }

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

    // Scoped by orgId as well as id — an id from another org must 404, not leak.
    const prospect = await db.crmProspect.findFirst({
      where: { id, orgId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        title: true,
        company: true,
        linkedinUrl: true,
        shortSummary: true,
        about: true,
        profilePicture: true,
        companyIndustry: true,
        companyWebsite: true,
        companyHeadquarters: true,
        companySize: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        // Returned so the extension can show a previously saved thread without
        // re-scraping. Opaque JSON, exactly as stored.
        linkedinConversation: true,
      },
    });

    if (!prospect) {
      return NextResponse.json(
        { success: false, error: "Prospect not found" },
        { status: 404 },
      );
    }

    // Message count is derived here so the side panel does not have to walk the
    // blob just to render "Saved conversation (N)".
    const conv = prospect.linkedinConversation as
      | { messages?: unknown[] }
      | unknown[]
      | null;
    let savedMessageCount = 0;
    if (Array.isArray(conv)) {
      savedMessageCount = conv.length;
    } else if (conv && typeof conv === "object" && Array.isArray(conv.messages)) {
      savedMessageCount = conv.messages.length;
    }

    return NextResponse.json({
      success: true,
      data: { orgId, prospect, savedMessageCount },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    console.error("[api] GET /api/extension-auth/prospects/[id]", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
