import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertAdmin } from "@/lib/auth/require-permission";
import { getRoleOverrides, setRoleOverride } from "@/lib/services/workspace/role-config";
import {
  SALES_MANAGER_ROLE,
  SALES_USER_ROLE,
  MARKETING_USER_ROLE,
  FINANCE_USER_ROLE,
} from "@/lib/auth/role-grants";

export const runtime = "nodejs";

/**
 * Role-config settings — per-role overrides stored as JSON on
 * OrgWorkspaceSettings.settings.roleOverrides (no schema/migration).
 *
 * Admin-only. Currently exposes the `restrictToOwnedLeads` toggle that powers
 * owner-based lead visibility (see lib/auth/owner-scope.ts). The Administrator
 * role is intentionally NOT settable here — admins always see everything, and
 * making them togglable would be a foot-gun (lock-out risk).
 */

// The non-admin roles an admin may configure. Administrator is excluded on
// purpose (never restricted). Kept as an allow-list so an arbitrary/unknown
// role string can't be written into the config blob.
const CONFIGURABLE_ROLES = [
  SALES_MANAGER_ROLE,
  SALES_USER_ROLE,
  MARKETING_USER_ROLE,
  FINANCE_USER_ROLE,
] as const;

const putSchema = z.object({
  role: z.enum(CONFIGURABLE_ROLES),
  restrictToOwnedLeads: z.boolean(),
});

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    assertAdmin(user);
    const overrides = await getRoleOverrides(user.tenantId);
    // Return a normalized view for the UI: every configurable role with its
    // current restrictToOwnedLeads value (defaulting to false when unset).
    const roles = CONFIGURABLE_ROLES.map((role) => ({
      role,
      restrictToOwnedLeads: overrides[role]?.restrictToOwnedLeads === true,
    }));
    return NextResponse.json({ roles });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    assertAdmin(user);
    const parsed = putSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { role, restrictToOwnedLeads } = parsed.data;
    await setRoleOverride(user.tenantId, role, { restrictToOwnedLeads });
    return NextResponse.json({ ok: true, role, restrictToOwnedLeads });
  } catch (e) {
    return errorResponse(e);
  }
}
