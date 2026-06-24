/**
 * Store-route gate (Item 7 batch 3).
 *
 * Drop-in replacement for the bare `getTenantContext()` pattern across
 * /api/store/* routes. Store splits into SEVEN sub-resources, mapped
 * from URL prefix:
 *
 *   stock-balance / stock-ledger / stock-register / items-stock /
 *     item-stock-locations             → construction.stock (read-only)
 *   issue(s) / material-issue          → construction.issue
 *   gate-pass(es)                      → construction.gatepass
 *   good-return(s) / internal-return   → construction.return
 *   transfer(s) / stock-transfer       → construction.transfer
 *   reconciliation(s) / stock-reconciliation → construction.reconciliation
 *   diesel-log(s)                      → construction.diesel
 *   grn under store/                   → construction.grn
 *
 * Usage:
 *   const ctxOrResp = await requireStoreAction("construction.issue", "approve");
 *   if (ctxOrResp instanceof NextResponse) return ctxOrResp;
 *   const ctx = ctxOrResp;
 */

import { NextResponse } from "next/server";
import { getTenantContext, type TenantContext } from "@/lib/auth/context";

export type StoreResource =
  | "construction.stock"
  | "construction.issue"
  | "construction.gatepass"
  | "construction.return"
  | "construction.transfer"
  | "construction.reconciliation"
  | "construction.diesel"
  | "construction.grn";

export type StoreAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "receive";

export async function requireStoreAction(
  resource: StoreResource,
  action: StoreAction,
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
