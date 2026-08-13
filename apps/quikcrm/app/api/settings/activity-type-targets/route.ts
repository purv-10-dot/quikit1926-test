/**
 * GET/PATCH /api/settings/activity-type-targets
 *
 * Per-salesperson DAILY targets for individual ACTIVITY TYPES, stored in the
 * CrmActivityTypeTarget table.
 *
 * Deliberately a SEPARATE endpoint from /api/settings/activity-targets (which
 * owns the overall daily target on the workspace-settings JSON). Keeping them
 * apart means the existing overall-target contract is untouched — its request
 * and response shapes are byte-for-byte what they were — and either screen can
 * save without clobbering the other.
 *
 * Access mirrors the overall-target route exactly: Super Admin / Organization
 * Admin / CRM Administrator via isCrmAdminUser; everyone else gets 403.
 *
 * Activity types are read from the org's ACTIVE CrmActivityType rows, so a type
 * created in Settings → Activity Types shows up here with no code change and
 * nothing is hardcoded.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { ensureDefaultActivityTypes } from "@/lib/services/activity-types/ensure-defaults";
import {
  listActiveTargetableTypes,
  getActivityTypeTargetsForUsers,
  setActivityTypeTargets,
  readCountSources,
} from "@/lib/services/workspace/activity-type-target-config";

export const runtime = "nodejs";

function forbidden() {
  return NextResponse.json(
    { success: false, error: "Access restricted to administrators." },
    { status: 403 },
  );
}

/**
 * GET → { types: [...], targets: { [userId]: { [activityTypeId]: number } } }
 *
 * Optional `?userIds=a,b,c` narrows the targets map; omitted returns targets
 * for every user that has any stored row, which is what the settings screen
 * needs to hydrate its grid.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (!isCrmAdminUser(user)) return forbidden();

    // Same self-healing seed the activity-types settings screen relies on, so a
    // brand-new org sees the default types here too.
    await ensureDefaultActivityTypes(user.orgId);

    const rawIds = req.nextUrl.searchParams.get("userIds");
    const userIds = rawIds
      ? rawIds.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const types = (await listActiveTargetableTypes(user.orgId)).map((t) => ({
      id: t.id,
      code: t.code,
      label: t.label,
      sortOrder: t.sortOrder,
      countsSources: readCountSources(t.config),
    }));

    const targets: Record<string, Record<string, number>> = {};
    if (userIds.length > 0) {
      const byUser = await getActivityTypeTargetsForUsers(user.orgId, userIds);
      for (const [userId, rows] of byUser) {
        const entry: Record<string, number> = {};
        for (const r of rows) if (r.dailyTarget > 0) entry[r.activityTypeId] = r.dailyTarget;
        if (Object.keys(entry).length > 0) targets[userId] = entry;
      }
    } else {
      // No filter: return every stored non-zero target in the org.
      const rows = await prisma.crmActivityTypeTarget.findMany({
        where: { orgId: user.orgId, dailyTarget: { gt: 0 } },
        select: { userId: true, activityTypeId: true, dailyTarget: true },
      });
      const activeIds = new Set(types.map((t) => t.id));
      for (const r of rows) {
        // Skip targets belonging to a deactivated type — they are retained in
        // the DB but must not surface while the type is inactive.
        if (!activeIds.has(r.activityTypeId)) continue;
        targets[r.userId] = { ...(targets[r.userId] ?? {}), [r.activityTypeId]: r.dailyTarget };
      }
    }

    return NextResponse.json({ success: true, data: { types, targets } });
  } catch (e) {
    return errorResponse(e);
  }
}

// A target is an integer ≥ 0. The client sends 0 for cleared/empty inputs
// ("empty defaults to 0"), so 0 is a valid, storable value — not a deletion.
const patchSchema = z.object({
  targets: z
    .array(
      z.object({
        userId: z.string().min(1),
        activityTypeId: z.string().min(1),
        dailyTarget: z.number().int().min(0).max(10000),
      }),
    )
    .max(5000),
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

    // setActivityTypeTargets re-checks that every activityTypeId is an ACTIVE
    // type in THIS org, so a forged id cannot write a cross-org row.
    const saved = await setActivityTypeTargets(user.orgId, parsed.data.targets);
    return NextResponse.json({ success: true, data: { saved } });
  } catch (e) {
    return errorResponse(e);
  }
}
