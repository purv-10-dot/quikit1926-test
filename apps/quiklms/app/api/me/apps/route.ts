import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/me/apps — the QuikIT apps this user may open, for the topbar switcher.
 *
 * AUTHORITY. Grants live in `quikit.UserAppAccess`, keyed by (userId, orgId,
 * appId). `AuthUser.id` IS the platform `User.id` and `AuthUser.orgId` IS the
 * platform `Org.id` (the LMS tables were re-keyed onto platform ids), so this
 * reads the real grant table rather than inferring access from roles. A user
 * only ever sees apps actually granted to them in the org they are signed into
 * — the switcher cannot become a way to discover or reach an app you were not
 * given.
 *
 * URL RESOLUTION mirrors the launcher/admin switcher: per-app env override →
 * `App.baseUrl` from the DB → dev localhost fallback. `App.baseUrl` holds
 * PRODUCTION urls, so without the override a local dev build would link
 * straight at production.
 */
const ENV_BASE_URLS: Record<string, string | undefined> = {
  quikit: process.env.NEXT_PUBLIC_QUIKIT_URL,
  auth: process.env.NEXT_PUBLIC_AUTH_URL,
  admin: process.env.NEXT_PUBLIC_ADMIN_URL,
  quikscale: process.env.NEXT_PUBLIC_QUIKSCALE_URL,
  quiktrack: process.env.NEXT_PUBLIC_QUIKTRACK_URL,
  quikvc: process.env.NEXT_PUBLIC_QUIKVC_URL,
  quikinfra: process.env.NEXT_PUBLIC_QUIKINFRA_URL,
  quiksocial: process.env.NEXT_PUBLIC_QUIKSOCIAL_URL,
  quikcrm: process.env.NEXT_PUBLIC_QUIKCRM_URL,
  quikhrms: process.env.NEXT_PUBLIC_QUIKHRMS_URL,
};

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
};

/** This app's own slug — flagged as current rather than hidden, so the switcher shows where you are. */
const SELF_SLUG = 'quiklms';

const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

function resolveUrl(slug: string, dbBaseUrl: string | null | undefined): string {
  const fromEnv = ENV_BASE_URLS[slug];
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  if (dbBaseUrl) {
    const url = dbBaseUrl.replace(/\/+$/, '');
    // `App.baseUrl` is NOT reliably production data — as of this writing the
    // live table holds `http://localhost:3003` for quikscale and localhost urls
    // for quikcrm/quikinfra/quiktrack. Emitting those from a production build
    // hands users a link to their own machine. Drop it and let the caller
    // filter the app out; a missing menu entry beats a broken one.
    if (process.env.NODE_ENV === 'production' && LOCALHOST.test(url)) return '';
    return url;
  }

  if (process.env.NODE_ENV !== 'production' && DEV_FALLBACKS[slug]) return DEV_FALLBACKS[slug];
  return '';
}

export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  if (!actor.orgId) return json({ success: true, data: { apps: [] } });

  const grants = await prisma.userAppAccess.findMany({
    where: { userId: actor.id, orgId: actor.orgId },
    select: {
      role: true,
      app: { select: { id: true, name: true, slug: true, baseUrl: true, iconUrl: true } },
    },
  });

  const apps = grants
    .map((g) => ({
      id: g.app.id,
      name: g.app.name,
      slug: g.app.slug,
      url: resolveUrl(g.app.slug, g.app.baseUrl),
      iconUrl: g.app.iconUrl ?? null,
      role: g.role,
      current: g.app.slug === SELF_SLUG,
    }))
    // An app with no resolvable url would render a dead menu item.
    .filter((a) => a.url || a.current)
    .sort((a, b) => a.name.localeCompare(b.name));

  return json({ success: true, data: { apps } });
});
