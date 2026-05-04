/**
 * GET /api/org/info
 *
 * Returns the current tenant's basic info (id, name, slug).
 * Used by the OPSP preview to render the tenant name in the document's
 * "Organization:" blue-band field. Lightweight read — no joins, no perms
 * beyond the standard tenant-auth guard.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";

export const GET = withTenantAuth(
  async ({ orgId }) => {
    const tenant = await db.tenant.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "Tenant not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: tenant });
  },
  { fallbackErrorMessage: "Failed to fetch organization info" },
);
