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
  departments: "cnDepartment",
  workCategories: "cnWorkCategory",
  costCenters: "cnCostCenter",
  machinery: "cnMachinery",
  companies: "cnCompany",
  financialYears: "cnFinancialYear",
  terms: "cnTermsCondition",
};

type MasterCountWhere = { orgId: string; status?: { not: string } };

/**
 * Model-name → typed count thunk. Calls the real Prisma delegate so the
 * model name and the `status` filter are compiler-checked — no string
 * indexing of `db`, no casts. (All 18 masters carry a `status` column.)
 */
const COUNT_FINDERS: Record<string, (where: MasterCountWhere) => Promise<number>> = {
  cnProject: (where) => db.cnProject.count({ where }),
  cnItem: (where) => db.cnItem.count({ where }),
  cnItemGroup: (where) => db.cnItemGroup.count({ where }),
  cnVendor: (where) => db.cnVendor.count({ where }),
  cnContractor: (where) => db.cnContractor.count({ where }),
  cnCustomer: (where) => db.cnCustomer.count({ where }),
  cnLocation: (where) => db.cnLocation.count({ where }),
  cnUOM: (where) => db.cnUOM.count({ where }),
  cnGSTCode: (where) => db.cnGSTCode.count({ where }),
  cnTDSCode: (where) => db.cnTDSCode.count({ where }),
  cnDepartment: (where) => db.cnDepartment.count({ where }),
  cnWorkCategory: (where) => db.cnWorkCategory.count({ where }),
  cnCostCenter: (where) => db.cnCostCenter.count({ where }),
  cnMachinery: (where) => db.cnMachinery.count({ where }),
  cnCompany: (where) => db.cnCompany.count({ where }),
  cnFinancialYear: (where) => db.cnFinancialYear.count({ where }),
  cnTermsCondition: (where) => db.cnTermsCondition.count({ where }),
};

async function countMaster(model: string, orgId: string): Promise<number> {
  const finder = COUNT_FINDERS[model];
  if (!finder) return 0;
  try {
    return await finder({ orgId, status: { not: "inactive" } });
  } catch {
    try {
      return await finder({ orgId });
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
