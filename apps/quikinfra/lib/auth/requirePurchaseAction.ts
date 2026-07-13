/**
 * Purchase-route gate (Item 7 batch 2).
 *
 * Drop-in replacement for the bare `getTenantContext()` pattern across
 * /api/purchase/* routes. Unlike masters (single resource), purchase
 * splits into FIVE sub-resources that map directly to the URL prefix:
 *
 *   /api/purchase/requisitions/* → construction.pr
 *   /api/purchase/indents/*      → construction.indent
 *   /api/purchase/rfqs/*         → construction.rfq
 *   /api/purchase/orders/*       → construction.po
 *   /api/purchase/grn/*          → construction.grn
 *
 * Usage:
 *   const ctxOrResp = await requirePurchaseAction("construction.po", "view");
 *   if (ctxOrResp instanceof NextResponse) return ctxOrResp;
 *   const ctx = ctxOrResp;
 *
 * Action vocabulary mirrors the seeded permission grants in
 * permissionsRegistry.ts. Approve/submit/etc. all live within view+create
 * +approve for these resources (no edit/delete in the role grants today;
 * lifecycle is via status transitions).
 */

import { NextResponse } from "next/server";
import { getTenantContext, type TenantContext } from "@/lib/auth/context";

export type PurchaseResource =
  | "construction.pr"
  | "construction.indent"
  | "construction.rfq"
  | "construction.po"
  | "construction.grn";

export type PurchaseAction = "view" | "create" | "edit" | "delete" | "approve";

export async function requirePurchaseAction(
  resource: PurchaseResource,
  action: PurchaseAction,
): Promise<TenantContext | NextResponse> {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 },
    );
  }
  const key = `${resource}.${action}`;
  if (!ctx.permissions.has(key) && !ctx.permissions.has("*")) {
    return NextResponse.json(
      { error: `Missing permission: ${key}` },
      { status: 403 },
    );
  }
  return ctx;
}
