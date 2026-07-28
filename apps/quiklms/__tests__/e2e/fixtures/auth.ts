/**
 * Session minting for E2E tests.
 *
 * The LMS is an OAuth *consumer*: the real login path bounces to the central
 * login app (:3001) and the IdP (:3000). Requiring both to be up for every
 * test run is slow and couples this suite to two other apps, so instead we
 * mint the NextAuth session cookie directly with the same `NEXTAUTH_SECRET`
 * the app validates against — exactly what `/auth-handoff` does internally.
 *
 * The claims below mirror what `createOAuthClientOptions` puts on the JWT.
 * `id` MUST be the identity user id, because `getAuthContext()` resolves the
 * LMS role via `lmsUser.findUnique({ where: { id: session.id } })`.
 */

import fs from "node:fs";
import path from "node:path";
import { encode } from "next-auth/jwt";

const E2E_DIR = path.join(__dirname, "..");
const MANIFEST_PATH = path.join(E2E_DIR, ".seed-manifest.json");

export type RoleKey =
  | "superAdmin" | "tenantAdmin" | "subAdmin"
  | "manager" | "teacher" | "parent" | "learner";

export interface SeedManifest {
  orgId: string;
  tenantId: string;
  subdomain: string;
  password: string;
  users: Record<RoleKey, { userId: string; lmsUserId: string; email: string; role: string }>;
  courses: { published: string; draft: string };
  modules: Array<{ id: string; lessons: string[] }>;
  assessmentId: string;
  batchId: string | null;
  /** A second tenant nobody in the primary org may see. */
  other: {
    orgId: string;
    tenantId: string;
    adminUserId: string;
    adminEmail: string;
    courseId: string;
  };
}

export function loadManifest(): SeedManifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `Seed manifest missing at ${MANIFEST_PATH}.\n` +
        `Run: cd packages/database && npx tsx prisma/seed-quiklms-e2e.ts`,
    );
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

/** Read NEXTAUTH_SECRET from the app's .env.local (tests don't load Next's env). */
export function getSecret(): string {
  const envPath = path.join(E2E_DIR, "..", "..", ".env.local");
  const m = fs.readFileSync(envPath, "utf8").match(/^NEXTAUTH_SECRET=(.*)$/m);
  if (!m) throw new Error("NEXTAUTH_SECRET not found in apps/quiklms/.env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/** The platform OrgMember role each seeded user holds — the JWT carries the
 *  PLATFORM role, and the app maps it to an LMS role only as a fallback. */
const ORG_MEMBER_ROLE: Record<RoleKey, string> = {
  superAdmin: "super_admin",
  tenantAdmin: "org_admin",
  subAdmin: "member",
  manager: "member",
  teacher: "member",
  parent: "member",
  learner: "member",
};

export async function mintSessionToken(role: RoleKey, overrides: Record<string, unknown> = {}) {
  const manifest = loadManifest();
  const u = manifest.users[role];
  if (!u) throw new Error(`Unknown role key '${role}'`);

  return encode({
    secret: getSecret(),
    maxAge: 60 * 60 * 8,
    token: {
      id: u.userId,
      sub: u.userId,
      email: u.email,
      name: `E2E ${role}`,
      firstName: "E2E",
      lastName: role,
      // Super admins are deliberately tenant-less in this platform.
      orgId: role === "superAdmin" ? manifest.orgId : manifest.orgId,
      membershipRole: ORG_MEMBER_ROLE[role],
      membershipCheckedAt: Date.now(),
      isSuperAdmin: role === "superAdmin",
      sessionId: `e2e-${role}-${u.userId}`,
      sessionTouchedAt: Date.now(),
      actingAs: "user",
      ...overrides,
    },
  });
}

/** A Playwright storageState object carrying the session cookie for `role`. */
export async function storageStateFor(role: RoleKey, baseURL = "http://localhost:3014") {
  const token = await mintSessionToken(role);
  const { hostname } = new URL(baseURL);
  return {
    cookies: [
      {
        name: "next-auth.session-token",
        value: token,
        domain: hostname,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 8 * 3600,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
}

export const ALL_ROLES: RoleKey[] = [
  "superAdmin", "tenantAdmin", "subAdmin", "manager", "teacher", "parent", "learner",
];
