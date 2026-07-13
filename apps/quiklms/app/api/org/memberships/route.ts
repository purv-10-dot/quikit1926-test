import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { orgDb } from '@/lib/org-db';

const APP_SLUG = 'quiklms';

/**
 * GET /api/org/memberships — the current user's active orgs where QuikLMS is
 * accessible (org-switcher data). Mirrors @quikit/auth's createOrgMembershipsHandler,
 * but reads the PLATFORM database via `orgDb` (ORG_DATABASE_URL): OrgMember / App /
 * UserAppAccess live there, NOT in this app's LMS db. The shared factory binds
 * `@quikit/database` to DATABASE_URL, which for QuikLMS is the LMS db — hence the
 * local port.
 */
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const userId = actor.id;

  // Narrow to orgs where the user actually has QuikLMS access. If the app row
  // isn't seeded yet, skip the filter (showing all beats showing none).
  const app = await orgDb.app.findUnique({ where: { slug: APP_SLUG }, select: { id: true } });
  const appId = app?.id ?? null;

  const memberships = await orgDb.orgMember.findMany({
    where: {
      userId,
      status: 'active',
      org: {
        status: 'active',
        ...(appId ? { userAppAccess: { some: { userId, appId } } } : {}),
      },
    },
    include: {
      org: {
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          status: true,
          logoUrl: true,
          brandColor: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const data = memberships.map((m) => ({
    membershipId: m.id,
    orgId: m.org.id,
    name: m.org.name,
    slug: m.org.slug,
    plan: m.org.plan,
    role: m.role,
    status: m.status,
    logoUrl: m.org.logoUrl,
    brandColor: m.org.brandColor,
    acceptedAt: m.acceptedAt,
  }));

  return json({ success: true, data });
});
