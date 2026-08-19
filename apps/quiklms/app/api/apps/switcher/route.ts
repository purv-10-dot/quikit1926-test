import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ADMIN_TIER_ROLES, HIDDEN_APP_SLUGS } from '@quikit/shared';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/apps/switcher — the apps this user can open, for the topbar waffle.
 *
 * This REPLACES `GET /api/me/apps`. Two things were wrong with that endpoint:
 * it sat on a bespoke path (every other app — admin, quikasset, quikcrm,
 * quikfinance, quikhrms, quikinfra, quikscale, quiksocial, quiksupport,
 * quiktrack — exposes `/api/apps/switcher`), and it re-implemented the
 * visibility rule from scratch and got it wrong. It read `UserAppAccess` and
 * nothing else, so it silently dropped FOUR of the five clauses the launcher
 * applies (baseline §4):
 *
 *   1. `OrgAppAccess.enabled` — never checked. An app the org never bought, or
 *      one an admin had explicitly disabled, still appeared in the menu.
 *   2. `App.requiresOrgAdmin` — never checked, so admin-tier apps were offered
 *      to ordinary members.
 *   3. The admin bypass — org/super admins hold org-level access WITHOUT a
 *      per-user row, so they saw an EMPTY switcher. This was the user-visible
 *      symptom.
 *   4. `HIDDEN_APP_SLUGS` / `quikit` — never excluded, so hidden apps and the
 *      launcher itself could be listed as switch targets.
 *
 * The rule below is the launcher's, clause for clause
 * (apps/quikit/app/api/apps/launcher/route.ts and packages/auth/app-access.ts).
 *
 * AUTHENTICATION, NOT ENTITLEMENT — deliberate. This reads the session directly
 * rather than going through `requireAuth`, which now enforces the QuikLMS
 * entitlement gate. A user whose LMS access was revoked must still be able to
 * open this menu: it is exactly the escape hatch they need to reach an app they
 * DO have. Gating the switcher on QuikLMS access would strand them. Matches
 * quikhrms/app/api/apps/switcher.
 *
 * Response shape is the platform-canonical `{ success, data[], quikitUrl }` so
 * this endpoint is drop-in for `@quikit/ui`'s `<AppSwitcher />` when QuikLMS
 * takes that dependency. `current` is additive — the shared component derives
 * it from the slug, but the local AppShell reads it.
 */

/** This app's slug — flagged as current rather than hidden, so the menu shows where you are. */
const SELF_SLUG = 'quiklms';

/**
 * Per-app URL override. `App.baseUrl` in the live table is NOT reliably
 * production data, so an env override always wins. Both the server-side and
 * `NEXT_PUBLIC_` names are read: QuikLMS's own env files historically set the
 * public variants.
 */
const ENV_BASE_URLS: Record<string, string | undefined> = {
  quikit: process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL,
  auth: process.env.NEXT_PUBLIC_AUTH_URL,
  admin: process.env.ADMIN_URL ?? process.env.NEXT_PUBLIC_ADMIN_URL,
  quikscale: process.env.QUIKSCALE_URL ?? process.env.NEXT_PUBLIC_QUIKSCALE_URL,
  quiktrack: process.env.QUIKTRACK_URL ?? process.env.NEXT_PUBLIC_QUIKTRACK_URL,
  quikvc: process.env.QUIKVC_URL ?? process.env.NEXT_PUBLIC_QUIKVC_URL,
  quikinfra: process.env.QUIKINFRA_URL ?? process.env.NEXT_PUBLIC_QUIKINFRA_URL,
  quiksocial: process.env.QUIKSOCIAL_URL ?? process.env.NEXT_PUBLIC_QUIKSOCIAL_URL,
  quikcrm: process.env.QUIKCRM_URL ?? process.env.NEXT_PUBLIC_QUIKCRM_URL,
  quikhrms: process.env.QUIKHRMS_URL ?? process.env.NEXT_PUBLIC_QUIKHRMS_URL,
  quiksupport: process.env.QUIKSUPPORT_URL ?? process.env.NEXT_PUBLIC_QUIKSUPPORT_URL,
  quikasset: process.env.QUIKASSET_URL ?? process.env.NEXT_PUBLIC_QUIKASSET_URL,
  quikfinance: process.env.QUIKFINANCE_URL ?? process.env.NEXT_PUBLIC_QUIKFINANCE_URL,
  quiklms: process.env.QUIKLMS_URL ?? process.env.NEXT_PUBLIC_QUIKLMS_URL,
};

/**
 * Dev-only localhost fallbacks. Must match `next dev -p <port>` in each app's
 * package.json. The previous map stopped at quikhrms, so quiklms, quikasset,
 * quikfinance and quiksupport had no fallback and were filtered out of the menu
 * in local dev.
 */
const DEV_FALLBACKS: Record<string, string> = {
  quikit: 'http://localhost:3000',
  auth: 'http://localhost:3001',
  admin: 'http://localhost:3002',
  quikscale: 'http://localhost:3003',
  quiktrack: 'http://localhost:3004',
  quikvc: 'http://localhost:3005',
  quikinfra: 'http://localhost:3006',
  quiksocial: 'http://localhost:3007',
  quikcrm: 'http://localhost:3008',
  quikhrms: 'http://localhost:3009',
  quiksupport: 'http://localhost:3010',
  quikasset: 'http://localhost:3012',
  quikfinance: 'http://localhost:3013',
  quiklms: 'http://localhost:3016',
};

const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

function resolveBaseUrl(slug: string, dbBaseUrl: string | null | undefined): string {
  const fromEnv = ENV_BASE_URLS[slug];
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  if (dbBaseUrl) {
    const url = dbBaseUrl.replace(/\/+$/, '');
    // Carried over from /api/me/apps, and NOT present in the sibling apps'
    // version — a genuine improvement worth keeping. The live `quikit.App`
    // table holds localhost baseUrls for several apps; emitting those from a
    // production build hands the user a link to their own machine. Drop it and
    // let the caller filter the app out — a missing menu entry beats a broken
    // one.
    if (process.env.NODE_ENV === 'production' && LOCALHOST.test(url)) return '';
    return url;
  }

  if (process.env.NODE_ENV !== 'production' && DEV_FALLBACKS[slug]) return DEV_FALLBACKS[slug];
  return '';
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const isSuperAdmin = session.user.isSuperAdmin === true;
  let orgId = session.user.orgId;
  let memberRole = session.user.membershipRole;

  // No org on the session yet — fall back to the first active membership.
  if (!orgId) {
    const membership = await db.orgMember.findFirst({
      where: { userId, status: 'active' },
      select: { orgId: true, role: true },
      orderBy: { createdAt: 'asc' },
    });
    orgId = membership?.orgId ?? undefined;
    memberRole = membership?.role ?? memberRole;
  }

  if (!orgId) {
    return NextResponse.json({ success: true, data: [], quikitUrl: ENV_BASE_URLS.quikit ?? null });
  }

  const memberIsAdmin = isSuperAdmin || ADMIN_TIER_ROLES.has(String(memberRole ?? ''));

  const [allApps, orgAllows, userAccess] = await Promise.all([
    db.app.findMany({
      where: { status: { not: 'disabled' }, slug: { notIn: ['quikit', ...HIDDEN_APP_SLUGS] } },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        iconUrl: true,
        baseUrl: true,
        status: true,
        requiresOrgAdmin: true,
      },
      orderBy: { name: 'asc' },
    }),
    db.orgAppAccess.findMany({ where: { orgId, enabled: true }, select: { appId: true } }),
    db.userAppAccess.findMany({ where: { userId, orgId }, select: { appId: true } }),
  ]);

  const orgAllowedAppIds = new Set(orgAllows.map((a) => a.appId));
  const userAppIds = new Set(userAccess.map((u) => u.appId));

  const data = allApps
    .filter((app) => {
      if (!orgAllowedAppIds.has(app.id)) return false;
      if (app.requiresOrgAdmin && !memberIsAdmin) return false;
      if (!isSuperAdmin && !memberIsAdmin && !userAppIds.has(app.id)) return false;
      return true;
    })
    .map((app) => ({
      ...app,
      baseUrl: resolveBaseUrl(app.slug, app.baseUrl),
      installed: true,
      current: app.slug === SELF_SLUG,
    }))
    // An app with no resolvable url would render a dead menu item. The CURRENT
    // app is kept regardless — it is never navigated to, only labelled.
    .filter((app) => app.baseUrl || app.current);

  return NextResponse.json(
    { success: true, data, quikitUrl: ENV_BASE_URLS.quikit ?? null },
    { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } },
  );
}
