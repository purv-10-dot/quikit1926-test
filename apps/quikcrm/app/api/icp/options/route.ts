/**
 * GET /api/icp/options — picker feed for the ICP form's multi-selects.
 *
 * Returns the active taxonomy master (grouped by kind) plus the org's
 * products/services in one round-trip, so opening the form is a single request
 * instead of four.
 *
 * Companies are deliberately NOT included: /api/accounts/picker already exists
 * and applies the account-scope ACL (lib/auth/account-acl). Re-querying
 * CrmAccount here would bypass that, so the form calls that endpoint instead.
 */

import { type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { listIcpTaxonomyOptions } from "@/lib/services/icp/icp-taxonomy-service";
import { ok, failFromError } from "@/lib/services/icp/responses";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "icp", "view");

    const [taxonomy, products] = await Promise.all([
      listIcpTaxonomyOptions(user.orgId),
      // A "service" is a CrmProduct with productType = Service, so one query
      // covers both the Products and Services ICP dimensions; the UI splits on
      // productType.
      db.crmProduct.findMany({
        where: { orgId: user.orgId, deletedAt: null, isActive: true },
        select: { id: true, name: true, sku: true, productType: true },
        orderBy: { name: "asc" },
        take: 1000,
      }),
    ]);

    return ok({
      industries: taxonomy.filter((t) => t.kind === "Industry"),
      verticals: taxonomy.filter((t) => t.kind === "Vertical"),
      technologies: taxonomy.filter((t) => t.kind === "Technology"),
      products: products.filter((p) => p.productType !== "Service"),
      services: products.filter((p) => p.productType === "Service"),
    });
  } catch (error: unknown) {
    return failFromError(error, "api/icp/options GET", "Failed to load ICP options");
  }
}
