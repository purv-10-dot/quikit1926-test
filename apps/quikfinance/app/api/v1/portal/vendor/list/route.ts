import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { portalRoute } from "@/lib/portal/api";

export const dynamic = "force-dynamic";

/** Vendor scoped lists. ?type=pos|bills */
export async function GET(request: NextRequest) {
  const guard = await portalRoute("vendor", "view");
  if (!guard.ok) return guard.response;
  const { orgId, contactId } = guard.context;
  if (!contactId) return ok([]);
  const type = request.nextUrl.searchParams.get("type") ?? "pos";

  try {
    let rows: unknown[] = [];
    if (type === "pos") {
      rows = (await prisma.$queryRaw`SELECT id, purchase_order_number, issue_date, due_date, total, status FROM purchase_orders WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ORDER BY issue_date DESC NULLS LAST, created_at DESC LIMIT 200`) as unknown[];
    } else if (type === "bills") {
      rows = (await prisma.$queryRaw`SELECT id, bill_number, issue_date, due_date, total, balance_due, status FROM bills WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ORDER BY issue_date DESC NULLS LAST, created_at DESC LIMIT 200`) as unknown[];
    } else {
      return fail(422, { code: "BAD_TYPE", message: "Unknown list type." });
    }
    return ok(rows);
  } catch (error) {
    return fail(500, { code: "VENDOR_LIST_FAILED", message: errorMessage(error) });
  }
}
