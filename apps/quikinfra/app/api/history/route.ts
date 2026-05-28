import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { listHistoryForEntity } from "@/lib/history/repository";

/**
 * GET /api/history?entityType=<type>&entityId=<id>
 *
 * Merged, tenant-scoped event timeline for one entity. Combines
 * CnApprovalInstance.history (workflow actions) with CnAuditLog
 * (field-level changes). See `listHistoryForEntity`.
 *
 * Used by the DataTable Change-History drawer to render real data on
 * pages that have audit/approval coverage (PO, RFQ, Indent, GRN, Issue,
 * Transfer, etc.).
 */
export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const entityTypeRaw = req.nextUrl.searchParams.get("entityType");
  const entityId = req.nextUrl.searchParams.get("entityId");
  if (!entityTypeRaw || !entityId) {
    return NextResponse.json(
      { error: "entityType and entityId are required" },
      { status: 400 },
    );
  }

  // Allow comma-separated values so the caller can union over the
  // historically inconsistent entityType strings (e.g. "material_issues,issue").
  const entityTypes = entityTypeRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const data = await listHistoryForEntity(ctx.orgId, entityTypes, entityId);
  return NextResponse.json({ data });
}
