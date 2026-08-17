import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { seedLmsAppRoles, ensureUserOnLmsRole } from '@/lib/api/seed-lms-app-roles';
import { ensureLmsRbacSeeded } from '@/lib/api/seed-lms-permissions';
import { ensureLmsUserForCentralId } from '@/lib/services/identity-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/internal/provision-roles — service-to-service only.
 *
 * Eagerly seeds this org's default QuikLMS AppRole rows (`admin` plus the six
 * lower LmsUserRole tiers) so the Admin Portal's role dropdown shows them
 * immediately instead of "No roles available", and the central assignAppRoles()
 * flow can resolve a role by name. Mirrors apps/quikscale + apps/quiktrack's endpoint of the same
 * path; called by the launcher's super-admin "grant app access" flow
 * (apps/quikit/lib/provisionAppRoles.ts) the moment QuikLMS is enabled for an org.
 *
 * Optionally accepts `adminUserIds: string[]` — every id in the payload gets
 * ADMIN, so a freshly-invited org admin has their role the moment they accept,
 * with no lazy-seed gap. (Previously only the org's "founding" admin — the
 * earliest admin-tier OrgMember row — got ADMIN and later ones got
 * TENANT_ADMIN; that distinction was removed 2026-08-04 for quikscale parity —
 * see lib/auth/role-resolution.ts.)
 *
 * Auth: shared INTERNAL_SECRET via `x-internal-secret` (mirrors the reference
 * apps + verify-token-remote). Not a user session — no auth guard.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_SECRET;
  const provided = req.headers.get('x-internal-secret');
  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let orgId: string | null = null;
  let adminUserIds: string[] = [];
  try {
    const body = (await req.json()) as { orgId?: unknown; adminUserIds?: unknown };
    if (typeof body.orgId === 'string' && body.orgId.trim()) orgId = body.orgId.trim();
    if (Array.isArray(body.adminUserIds)) {
      adminUserIds = body.adminUserIds.filter(
        (v): v is string => typeof v === 'string' && v.trim().length > 0,
      );
    }
  } catch {
    // fall through to 400
  }
  if (!orgId) {
    return NextResponse.json({ success: false, error: 'orgId is required' }, { status: 400 });
  }

  try {
    const roles = await seedLmsAppRoles(orgId);
    // The grants behind those roles. Without them the org has a role catalogue that
    // authorises nothing, and every request from its members is refused.
    await ensureLmsRbacSeeded(orgId);
    // Per-user, not one shared try. One unassignable id must not discard the role
    // seeding that already succeeded — the catalogue is the reason the launcher
    // calls this endpoint, and returning 500 made the caller record a total failure
    // for a request that had done most of its job.
    const skipped: string[] = [];
    // Every id in the payload gets ADMIN — quikscale parity: `org_admin` is
    // the top LMS tier, first invite or fifth. See lib/auth/role-resolution.ts.
    for (const userId of adminUserIds) {
      try {
        // These are CENTRAL user ids. QuikLMS's assignment table keys on its own
        // `app_quiklms.users`, so the local row has to exist before a role can be
        // attached to it — the launcher creates the person centrally and has no way
        // to create the LMS side. Without this the assignment silently no-opped and
        // the org's first admin was left with no role at all; see
        // `ensureLmsUserForCentralId` for the full account.
        const provisioned = await ensureLmsUserForCentralId(userId, orgId, 'ADMIN');
        const assigned = provisioned && (await ensureUserOnLmsRole(userId, orgId, 'ADMIN'));
        if (!assigned) {
          skipped.push(userId);
          // eslint-disable-next-line no-console
          console.warn(
            `[provision-roles] could not assign ADMIN to ${userId} in ${orgId}: ` +
              (provisioned ? 'role catalogue missing' : 'no central user, or the email is taken by another LMS row'),
          );
        }
      } catch (err) {
        skipped.push(userId);
        // eslint-disable-next-line no-console
        console.warn(
          `[provision-roles] could not assign ADMIN to ${userId} in ${orgId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    // `skipped` is reported rather than swallowed: an admin who was NOT given the
    // role is something the caller should be able to see, even on a 200.
    return NextResponse.json({
      success: true,
      data: { roles: roles.size, assigned: adminUserIds.length - skipped.length, skipped },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Role provisioning failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
