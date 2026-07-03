/**
 * GET /api/public/me
 *
 * Validates the API key and returns the organization/workspace it resolves to.
 * The response shape is the third-party integration contract (bare JSON, not
 * the internal `{ success, data }` envelope):
 *
 *   { "orgId": "...", "orgName": "..." }
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withPublicApiAuth } from "@/lib/api/public-api-auth";

export const runtime = "nodejs";

interface PublicMeResponse {
  orgId: string;
  orgName: string;
}

export const GET = withPublicApiAuth(
  async ({ orgId }): Promise<NextResponse> => {
    const org = await db.org.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });

    if (!org) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    const body: PublicMeResponse = { orgId: org.id, orgName: org.name };
    return NextResponse.json(body);
  },
);
