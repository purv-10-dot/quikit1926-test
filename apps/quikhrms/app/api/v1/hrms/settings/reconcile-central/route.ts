import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, serviceUnavailable } from "@/lib/api-response";
import { memberLookupRemote, type CentralMemberStatus } from "@/lib/auth/member-lookup-remote";
import { applyCentralState, centralSyncConfigured } from "@/lib/rbac/central-sync";
import { mappedHrmsRole } from "@/lib/rbac/provisioning";
import { createAuditLog } from "@/lib/utils/audit";

/** App slug HRMS is registered under in the central QuikIT app registry. */
const QUIKHRMS_APP_SLUG = "quikhrms";

/** Central lookup accepts at most this many keys per call. */
const LOOKUP_CHUNK = 500;

const bodySchema = z.object({
  /** false (default) = report drift only; true = also apply safe fixes. */
  fix: z.boolean().optional().default(false),
});

type DriftKind =
  | "central_user_missing"     // linked employee whose central User no longer exists
  | "central_access_revoked"   // membership removed/inactive or app access revoked
  | "central_role_drift"       // central role changed since last sync
  | "unlinked_employee"        // no authUserId but a central user exists for the email
  | "reactivation_pending";    // sync-deactivated employee whose central access is back

interface DriftEntry {
  employeeId: string;
  employeeCode: string;
  workEmail: string;
  kind: DriftKind;
  detail: string;
  fixed: boolean;
}

/**
 * POST /api/v1/hrms/settings/reconcile-central
 *
 * Compares every (non-deleted) employee against the LIVE central QuikIT
 * membership state and reports drift between the two databases. With
 * `fix: true` it also applies the safe corrections:
 *   - deactivate employees whose central membership / app access is gone
 *   - reactivate sync-deactivated employees whose central access is back
 *   - re-map admin/employee on central role transitions
 *   - backfill Employee.authUserId for employees central already knows by email
 * Anything riskier (deleting employees, creating central users) is reported
 * only — those are deliberate admin actions, not reconciliation.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    if (!centralSyncConfigured()) {
      return serviceUnavailable("Central QuikIT lookup is not configured (QUIKIT_URL / INTERNAL_SECRET).");
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const { fix } = parsed.data;

    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null },
      select: {
        id: true, employeeCode: true, workEmail: true, authUserId: true,
        status: true, centralRole: true, centralDeactivatedAt: true,
      },
    });

    const linked = employees.filter((e) => e.authUserId);
    const unlinked = employees.filter((e) => !e.authUserId && e.workEmail);

    // Batch-fetch live central state: linked employees by central User.id,
    // unlinked ones by email (to detect link backfill candidates).
    const byRequested = new Map<string, CentralMemberStatus>();
    const keys = [
      ...linked.map((e) => ({ kind: "userId" as const, value: e.authUserId as string })),
      ...unlinked.map((e) => ({ kind: "email" as const, value: e.workEmail.toLowerCase() })),
    ];
    for (let i = 0; i < keys.length; i += LOOKUP_CHUNK) {
      const chunk = keys.slice(i, i + LOOKUP_CHUNK);
      const lookup = await memberLookupRemote({
        orgId: orgId,
        appSlug: QUIKHRMS_APP_SLUG,
        userIds: chunk.filter((k) => k.kind === "userId").map((k) => k.value),
        emails: chunk.filter((k) => k.kind === "email").map((k) => k.value),
      });
      if (!lookup.ok) {
        return serviceUnavailable(lookup.error ?? "Central lookup failed. Please try again.");
      }
      for (const m of lookup.members ?? []) byRequested.set(m.requested, m);
    }

    const drift: DriftEntry[] = [];
    let fixedCount = 0;

    for (const e of linked) {
      const m = byRequested.get(e.authUserId as string) ?? null;
      const hasLiveAccess =
        m !== null &&
        (m.isSuperAdmin || (m.found && m.memberStatus === "active" && m.hasAppAccess));
      const liveCentralRole = m?.isSuperAdmin ? "super_admin" : (m?.memberRole ?? null);

      let kind: DriftKind | null = null;
      let detail = "";
      if (!m?.found) {
        kind = "central_user_missing";
        detail = "No central QuikIT user exists for this employee's authUserId.";
      } else if (!hasLiveAccess) {
        kind = "central_access_revoked";
        detail = `Central membership status="${m.memberStatus ?? "none"}", appAccess=${m.hasAppAccess}.`;
      } else if (e.centralDeactivatedAt && e.status === "Suspended") {
        kind = "reactivation_pending";
        detail = "Central access restored but the employee is still sync-deactivated.";
      } else if (
        e.centralRole !== null &&
        e.centralRole !== liveCentralRole &&
        mappedHrmsRole(e.centralRole, e.centralRole === "super_admin") !==
          mappedHrmsRole(liveCentralRole, m.isSuperAdmin)
      ) {
        kind = "central_role_drift";
        detail = `Central role changed "${e.centralRole}" → "${liveCentralRole}".`;
      }

      if (!kind) continue;
      let fixed = false;
      if (fix) {
        // applyCentralState handles deactivate / reactivate / role re-map in
        // one place — the same logic the per-request sync uses.
        await applyCentralState(orgId, e.id, m);
        fixed = true;
        fixedCount++;
      }
      drift.push({ employeeId: e.id, employeeCode: e.employeeCode, workEmail: e.workEmail, kind, detail, fixed });
    }

    for (const e of unlinked) {
      const m = byRequested.get(e.workEmail.toLowerCase());
      if (!m?.found || !m.userId) continue; // no central user → nothing to link
      let fixed = false;
      if (fix) {
        // Backfill the identity link only when still unclaimed (mirrors the
        // first-login backfill in with-auth.ts).
        const res = await prisma.employee.updateMany({
          where: { id: e.id, orgId, authUserId: null },
          data: { authUserId: m.userId, centralRole: m.isSuperAdmin ? "super_admin" : m.memberRole },
        });
        fixed = res.count > 0;
        if (fixed) fixedCount++;
      }
      drift.push({
        employeeId: e.id,
        employeeCode: e.employeeCode,
        workEmail: e.workEmail,
        kind: "unlinked_employee",
        detail: `Central user ${m.userId} exists for this email but the employee is not linked.`,
        fixed,
      });
    }

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Employee", entityId: "reconcile-central",
      metadata: { checked: employees.length, drift: drift.length, fixed: fixedCount, fixRequested: fix },
    });

    return successResponse({ checked: employees.length, driftCount: drift.length, fixed: fixedCount, drift });
  } catch (error) {
    console.error("POST /settings/reconcile-central error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.rbac.manage"],
  rateLimit: { max: 6, windowSec: 60, by: "tenant", scope: "reconcile-central" },
});
