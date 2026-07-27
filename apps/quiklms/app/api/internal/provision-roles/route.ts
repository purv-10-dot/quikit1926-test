import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { seedLmsAppRoles, ensureUserOnLmsRole } from '@/lib/api/seed-lms-app-roles';

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
 * Optionally accepts `adminUserIds: string[]` — each is assigned the
 * TENANT_ADMIN role (QuikLMS's org-admin tier) so a freshly-invited org admin
 * has their role the moment they accept, with no lazy-seed gap.
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
    for (const userId of adminUserIds) {
      await ensureUserOnLmsRole(userId, orgId, 'TENANT_ADMIN');
    }
    return NextResponse.json({ success: true, data: { roles: roles.size } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Role provisioning failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
