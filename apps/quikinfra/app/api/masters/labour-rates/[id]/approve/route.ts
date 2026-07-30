import { toErrorMessage } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import { approveLabourRate } from "@/lib/masters/labour-rates-repository";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  // Approval is an admin-level action. (Dedicated construction.labour.rate.approve
  // key is registered with the manifest task; masters.edit + wildcard cover it now.)
  if (!ctx.permissions.has("construction.master_labour.edit") && !ctx.permissions.has("*")) {
    return envelopeErr("FORBIDDEN", "Missing permission to approve labour rates", 403);
  }
  try {
    const next = await approveLabourRate(ctx.orgId, params.id, ctx.userId);
    if (!next) return NextResponse.json({ error: "Labour rate not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    console.error("[labour-rate.approve] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to approve labour rate"), 500);
  }
}
