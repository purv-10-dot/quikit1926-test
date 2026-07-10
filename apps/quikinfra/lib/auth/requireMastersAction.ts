/**
 * Masters-route gate (Item 7 batch 1).
 *
 * Drop-in replacement for the bare `getTenantContext()` check used in
 * every /api/masters/* route. Verifies the caller has the v2 permission
 * `construction.masters.<action>` (or the `*` wildcard) before returning
 * the tenant context.
 *
 * Replaces this pattern:
 *
 *   const ctx = await getTenantContext();
 *   if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
 *
 * with:
 *
 *   const ctxOrResp = await requireMastersAction("view");
 *   if (ctxOrResp instanceof NextResponse) return ctxOrResp;
 *   const ctx = ctxOrResp;
 *
 * Action mapping per HTTP method:
 *   GET    → "view"
 *   POST   → "create"
 *   PUT    → "edit"
 *   PATCH  → "edit"
 *   DELETE → "delete"
 *
 * Routes that import/export sheets use "import" / "export".
 */

import { NextResponse } from "next/server";
import { getTenantContext, type TenantContext } from "@/lib/auth/context";

export type MastersAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "import"
  | "export";

export async function requireMastersAction(
  action: MastersAction,
): Promise<TenantContext | NextResponse> {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 },
    );
  }
  // Masters are lookup/reference data picked across every module (PR, BOQ,
  // GRN, stock, projects). VIEW is therefore granted to ANY authenticated
  // user in the org — every role can populate dropdowns by default. Reads
  // stay scoped to ctx.orgId in each repository, so this never crosses
  // tenants. Mutating actions (create / edit / delete / import / export)
  // still require the explicit `construction.masters.<action>` permission.
  if (action === "view") {
    return ctx;
  }
  const key = `construction.masters.${action}`;
  // Admin role + super-admin both hold the `*` wildcard. Honour both.
  if (!ctx.permissions.has(key) && !ctx.permissions.has("*")) {
    return NextResponse.json(
      { error: `Missing permission: ${key}` },
      { status: 403 },
    );
  }
  return ctx;
}
