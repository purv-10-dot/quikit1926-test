/**
 * Dev-aware session helper.
 *
 * Returns the real NextAuth session when one exists. In dev (NODE_ENV !==
 * "production"), if no session is present, returns a synthetic session
 * tied to the seeded ValleyNXT tenant + analyst account so server pages
 * can render without auth.
 *
 *   ⚠ Sprint 2 only. Sprint 5 removes when real auth lands.
 *
 * Usage:
 *   const session = await getDevAwareSession();
 *   const tenantId = session?.user?.tenantId;
 */
import { getServerSession } from "next-auth/next";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const isProd = process.env.NODE_ENV === "production";

/** Tenant slug seeded by `npm run db:seed:quikvc`. */
const DEMO_TENANT_SLUG = "valleynxt";

/** Cached synthetic session — looked up once per process. */
let cachedDemo: Session | null = null;

async function buildDemoSession(): Promise<Session | null> {
  if (cachedDemo) return cachedDemo;

  const tenant = await db.tenant.findUnique({
    where: { slug: DEMO_TENANT_SLUG },
    select: {
      id: true,
      users: {
        where: { role: "analyst" },
        select: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        take: 1,
      },
    },
  });
  if (!tenant) return null;

  const member = tenant.users[0];
  if (!member) return null;

  cachedDemo = {
    user: {
      id: member.user.id,
      email: member.user.email,
      name: `${member.user.firstName} ${member.user.lastName}`,
      tenantId: tenant.id,
      membershipRole: "analyst",
      isSuperAdmin: false,
    },
    expires: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  } satisfies Session;
  return cachedDemo;
}

export async function getDevAwareSession(): Promise<Session | null> {
  const real = await getServerSession(authOptions);
  if (real) return real;
  if (isProd) return null;
  return buildDemoSession();
}
