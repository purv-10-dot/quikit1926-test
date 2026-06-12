import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";

/**
 * Masters summary — per-master record counts for the /masters card grid.
 * One org-scoped count() per master table. Counts ACTIVE rows (excluding
 * soft-deleted `status: "inactive"`) so the card number matches each list's
 * default view; models without a `status` column fall back to a plain org
 * count, and any unexpected error degrades that single card to 0 rather than
 * failing the whole endpoint.
 */

// Card key (matches the page's MASTERS entries) → Prisma model accessor.
const MASTER_MODELS: Record<string, string> = {
  projects: "cnProject",
  items: "cnItem",
  itemGroups: "cnItemGroup",
  vendors: "cnVendor",
  contractors: "cnContractor",
  customers: "cnCustomer",
  locations: "cnLocation",
  uom: "cnUOM",
  gst: "cnGSTCode",
  tds: "cnTDSCode",
  banks: "cnBank",
  departments: "cnDepartment",
  workCategories: "cnWorkCategory",
  costCenters: "cnCostCenter",
  machinery: "cnMachinery",
  companies: "cnCompany",
  financialYears: "cnFinancialYear",
  terms: "cnTermsCondition",
};

async function countMaster(model: string, orgId: string): Promise<number> {
  const m = (db as any)[model];
  if (!m?.count) return 0;
  try {
    return await m.count({ where: { orgId, status: { not: "inactive" } } });
  } catch {
    try {
      return await m.count({ where: { orgId } });
    } catch {
      return 0;
    }
  }
}

export async function GET() {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const keys = Object.keys(MASTER_MODELS);
  const counts = await Promise.all(
    keys.map((k) => countMaster(MASTER_MODELS[k], ctx.orgId)),
  );
  const data: Record<string, number> = {};
  keys.forEach((k, i) => {
    data[k] = counts[i];
  });
  return NextResponse.json({ data });
}
