import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { LmsUserRole } from '@prisma/client';
import { seedLmsAppRoles, ensureUserOnLmsRole } from '@/lib/api/seed-lms-app-roles';
import { ensureLmsRbacSeeded } from '@/lib/api/seed-lms-permissions';
import { getFoundingAdminUserId } from '@/lib/auth/founding-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/internal/provision-roles — service-to-service only.
 *
 * Eagerly seeds this org's default QuikLMS AppRole rows (the seven LmsUserRole
 * roles) so the Admin Portal's role dropdown shows them immediately instead of
 * "No roles available", and the central assignAppRoles() flow can resolve a
 * role by name. Mirrors apps/quikscale + apps/quiktrack's endpoint of the same
 * path; called by the launcher's super-admin "grant app access" flow
 * (apps/quikit/lib/provisionAppRoles.ts) the moment QuikLMS is enabled for an org.
 *
 * Optionally accepts `adminUserIds: string[]` — the org's founding admin is
 * assigned SUPER_ADMIN (the top tier) and any other id in the payload gets
 * TENANT_ADMIN, so a freshly-invited org admin has their role the moment they
 * accept, with no lazy-seed gap.
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
    // The org's FOUNDING admin gets SUPER_ADMIN — the top tier, landing on
    // `/dashboard` — and every other admin in the payload gets TENANT_ADMIN. The
    // launcher cannot make this distinction for us: QuikIT's invite form only ever
    // sends `org_admin`, so "the first invitation into a new org" has to be derived
    // here (and again at login, for the common case where the invitee has no LMS
    // row yet and the assignment below is skipped). See lib/auth/founding-admin.ts.
    //
    // A failed lookup returns null, so nobody matches and everyone gets
    // TENANT_ADMIN. That is the deliberate direction: an under-privileged admin is
    // repairable from the super-admin console, a wrongly-minted top-tier admin off
    // a failed read is not.
    const foundingAdminId = await getFoundingAdminUserId(orgId);
    for (const userId of adminUserIds) {
      const roleName: LmsUserRole = userId === foundingAdminId ? 'SUPER_ADMIN' : 'TENANT_ADMIN';
      try {
        await ensureUserOnLmsRole(userId, orgId, roleName);
      } catch (err) {
        skipped.push(userId);
        // eslint-disable-next-line no-console
        console.warn(
          `[provision-roles] could not assign ${roleName} to ${userId} in ${orgId}:`,
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
