/**
 * GET/PATCH /api/settings/activity-targets
 *
 * Org-wide default daily activity target + optional per-user overrides, stored
 * on CrmOrgWorkspaceSettings.settings.activityTargets.
 *
 * Access is restricted to Super Admin / Organization Admin / CRM Administrator
 * via isCrmAdminUser — Sales Manager, Sales User, Marketing/Finance users get
 * 403. (This is stricter than the generic settings.edit gate on purpose.)
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import {
  getActivityTargetConfig,
  setActivityTargetConfig,
} from "@/lib/services/workspace/activity-target-config";

export const runtime = "nodejs";

function forbidden() {
  return NextResponse.json(
    { success: false, error: "Access restricted to administrators." },
    { status: 403 },
  );
}

export async function GET(_req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (!isCrmAdminUser(user)) return forbidden();

    const data = await getActivityTargetConfig(user.orgId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}

const assignmentSchema = z.object({
  enabled: z.boolean(),
  dailyTarget: z.number().int().min(0).max(1000).optional(),
});

const patchSchema = z.object({
  defaultDailyTarget: z.number().int().min(0).max(1000).optional(),
  weeklyWorkingDays: z.number().int().min(1).max(7).optional(),
  perUser: z.record(assignmentSchema).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (!isCrmAdminUser(user)) return forbidden();

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = await setActivityTargetConfig(user.orgId, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}
