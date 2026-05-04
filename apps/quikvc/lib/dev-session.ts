/**
 * Dev-aware session helper.
 *
 * Returns the real NextAuth session when one exists. The synthetic
 * "demo session" fallback is now OPT-IN via env:
 *
 *   QUIKVC_DEV_BYPASS=1   → fall back to demo session (analyst by default)
 *   QUIKVC_DEV_ROLE=…     → pick which seeded role the demo uses
 *
 * In every other environment (including local dev without the flag, preview,
 * staging, production), this returns null when no real session exists —
 * forcing callers to redirect to /login or render a sign-in placeholder.
 *
 * Prefer the new `requireSession()` helper for pages — it handles the
 * redirect for you.
 *
 *   ⚠ The demo bypass is for local dev only. Never set QUIKVC_DEV_BYPASS
 *     in any deployed environment.
 */
import { getServerSession } from "next-auth/next";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Demo bypass enabled? Strict opt-in via env. We accept "1" / "true" /
 * "yes" (case-insensitive) so different shells can set it ergonomically.
 */
function isDevBypassEnabled(): boolean {
  const v = (process.env.QUIKVC_DEV_BYPASS ?? "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes";
}

/** Tenant slug seeded by `npm run db:seed:quikvc`. */
const DEMO_TENANT_SLUG = "valleynxt";

/**
 * Override the demo role via env: QUIKVC_DEV_ROLE = "analyst" | "partner" |
 * "fund-admin" | "ic-member" | "founder" | "investor". Defaults to "analyst".
 * Useful for testing admin write routes without real auth wired up.
 */
const DEMO_ROLE = process.env.QUIKVC_DEV_ROLE ?? "analyst";

/** Cached synthetic session keyed by role — looked up once per process per role. */
const cachedDemoByRole = new Map<string, Session>();

async function buildDemoSession(role: string): Promise<Session | null> {
  const cached = cachedDemoByRole.get(role);
  if (cached) return cached;

  const tenant = await db.org.findUnique({
    where: { slug: DEMO_TENANT_SLUG },
    select: {
      id: true,
      users: {
        where: { role },
        select: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        take: 1,
      },
    },
  });
  if (!tenant) return null;

  // Fall back to any active member of the tenant if the requested role isn't seeded
  const member = tenant.users[0]
    ?? (await (async () => {
      const any = await db.orgMember.findFirst({
        where: { orgId: tenant.id, status: "active" },
        select: { role: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      });
      return any ? { user: any.user } : null;
    })());
  if (!member) return null;

  const session: Session = {
    user: {
      id: member.user.id,
      email: member.user.email,
      name: `${member.user.firstName} ${member.user.lastName}`,
      orgId: tenant.id,
      membershipRole: role,
      isSuperAdmin: false,
    },
    expires: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  };
  cachedDemoByRole.set(role, session);
  return session;
}

export async function getDevAwareSession(): Promise<Session | null> {
  const real = await getServerSession(authOptions);
  if (real) return real;
  if (!isDevBypassEnabled()) return null;
  return buildDemoSession(DEMO_ROLE);
}
