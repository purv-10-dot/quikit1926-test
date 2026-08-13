import { encode } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

/**
 * QuikFlow's /login page is SSO-only (app/login/page.tsx calls
 * signIn("quikit", ...) unconditionally — no credentials form exists to
 * automate). Playwright can't complete a real SSO round-trip against the
 * QuikIT launcher in an isolated e2e run, so instead of driving the UI we
 * mint a real NextAuth JWT session cookie directly (same secret, same
 * decode path the app already trusts) for the e2e-admin user created by
 * `npm run db:seed:e2e` (repo root — shared across every app's e2e suite),
 * and hand it to every spec via `storageState`. Mirrors
 * apps/quikscale/__tests__/e2e/global-setup.ts.
 *
 * `sessionId` is deliberately omitted from the token — the auth package's
 * jwt() callback only runs its Redis soft-revocation check when
 * `token.sessionId` is truthy, so leaving it unset skips that check instead
 * of requiring a matching Redis session to be seeded here too.
 */
export default async function globalSetup() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not set — required to mint the e2e session cookie.");
  }

  const db = new PrismaClient();
  try {
    const org = await db.org.findUnique({ where: { slug: "e2e-tenant" } });
    if (!org) {
      throw new Error('e2e-tenant org not found — run "npm run db:seed:e2e" from the repo root first.');
    }
    const user = await db.user.findUnique({ where: { email: "e2e-admin@test.com" } });
    if (!user) {
      throw new Error('e2e-admin@test.com not found — run "npm run db:seed:e2e" from the repo root first.');
    }
    const membership = await db.orgMember.findFirst({ where: { orgId: org.id, userId: user.id } });
    if (!membership) {
      throw new Error("e2e-admin has no OrgMember row in e2e-tenant — re-run the seed script.");
    }

    const maxAge = 30 * 24 * 60 * 60;
    const token = await encode({
      secret,
      maxAge,
      token: {
        id: user.id,
        email: user.email,
        orgId: org.id,
        membershipRole: membership.role,
        isSuperAdmin: user.isSuperAdmin ?? false,
      },
    });

    const baseUrl = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3016");
    const storageState = {
      cookies: [
        {
          name: "next-auth.session-token",
          value: token,
          domain: baseUrl.hostname,
          path: "/",
          expires: Math.floor(Date.now() / 1000) + maxAge,
          httpOnly: true,
          secure: false,
          sameSite: "Lax" as const,
        },
      ],
      origins: [],
    };

    const outDir = path.join(__dirname, ".auth");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "e2e-admin.json"), JSON.stringify(storageState, null, 2));
  } finally {
    await db.$disconnect();
  }
}
