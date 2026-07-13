/**
 * Equipment-route gate for /api/equipment/* routes.
 */

import { NextResponse } from "next/server";
import { getTenantContext, type TenantContext } from "@/lib/auth/context";

export type EquipmentResource =
  | "construction.equipment_log"
  | "construction.equipment_maintenance"
  | "construction.equipment_deployment"
  | "construction.equipment_fleet"
  | "construction.equipment_hire_rent"
  | "construction.equipment_fixed_assets";

export type EquipmentAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve";

export async function requireEquipmentAction(
  resource: EquipmentResource,
  action: EquipmentAction,
): Promise<TenantContext | NextResponse> {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
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
