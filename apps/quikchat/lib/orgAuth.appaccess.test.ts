/**
 * `withOrgAuth` entitlement gate — the API-surface half of app access.
 *
 * WHY THIS FILE EXISTS AT ALL: before it, there was NO runnable test of
 * `withOrgAuth`. Every route test mocks the wrapper away to get at its handler,
 * and `lib/server/rate-limit-gate.test.ts` — the only test of the wrapper
 * itself — is both excluded from Vitest (vitest.config.ts) and stale (it mocks
 * `getRawSession`, which the wrapper stopped using when it moved to `withAuth`).
 * A gate nobody could test is how "the UI refuses to load, so the API must be
 * safe" survived as an assumption.
 *
 * Mock-backed on purpose: DB-backed suites in this app are all excluded, so a
 * DB-backed test here would never run — which is the exact failure mode above.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "org-1";
const USER = "u1";

// The JWT layer. Returns the AuthContext shape `withOrgAuth` consumes; each
// test rewrites `authCtx` to vary the caller.
let authCtx: Record<string, unknown> = {};
vi.mock("@quikit/auth/with-auth", () => ({
  withAuth: vi.fn(async () => authCtx),
}));

// The access rule itself is `@quikit/auth`'s and is tested there; here we only
// care that the wrapper calls it with the right arguments and honours its answer.
const getAppAccess = vi.fn(async () => ({ hasAccess: true, otherAppsCount: 0 }));
vi.mock("@quikit/auth/app-access", () => ({
  getAppAccess: (...a: unknown[]) => getAppAccess(...(a as [])),
}));

// Seeding is a separate concern with its own suite — keep it out of the way and
// assert only on whether it was REACHED.
const ensureUserRole = vi.fn(async () => undefined);
vi.mock("@/lib/authz/seed", () => ({
  ensureUserRole: (...a: unknown[]) => ensureUserRole(...(a as [])),
}));

import { _clearLocalCache } from "@quikit/auth/cache";
import { withOrgAuth } from "@/lib/orgAuth";

beforeEach(() => {
  vi.clearAllMocks();
  // The verdict cache is a process-wide LRU. Without this, the first test's
  // answer would leak into every later one and they would pass for free.
  _clearLocalCache();
  authCtx = {
    userId: USER,
    orgId: ORG,
    orgRole: "member",
    isSuperAdmin: false,
    permissions: [],
    email: null,
    actingAs: "user",
    actingAgentId: null,
  };
  getAppAccess.mockResolvedValue({ hasAccess: true, otherAppsCount: 0 });
});

const ok = () => Response.json({ ok: true });

describe("withOrgAuth — QuikChat entitlement", () => {
  it("403s an authenticated same-org user with no QuikChat access", async () => {
    getAppAccess.mockResolvedValue({ hasAccess: false, otherAppsCount: 2 });

    const res = await withOrgAuth(ok)(new Request("http://t/api/channels"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "QuikChat access required" });
  });

  it("does not run the handler for a denied caller", async () => {
    getAppAccess.mockResolvedValue({ hasAccess: false, otherAppsCount: 0 });
    const handler = vi.fn(ok);

    await withOrgAuth(handler)(new Request("http://t/api/channels"));

    expect(handler).not.toHaveBeenCalled();
  });

  // Data hygiene as well as security: a caller who cannot open the app has no
  // business acquiring a QcUserAppRole binding. The assertion runs BEFORE the
  // seed-before-check for exactly this reason.
  it("rejects before seeding, so no role is bound for a denied caller", async () => {
    getAppAccess.mockResolvedValue({ hasAccess: false, otherAppsCount: 0 });

    await withOrgAuth(ok)(new Request("http://t/api/channels"));

    expect(ensureUserRole).not.toHaveBeenCalled();
  });

  it("allows a caller with access, and still seeds", async () => {
    const res = await withOrgAuth(ok)(new Request("http://t/api/channels"));

    expect(res.status).toBe(200);
    expect(ensureUserRole).toHaveBeenCalledWith(USER, ORG);
  });

  // THE LOCKOUT GUARD. `getAppAccess` rule 3 grants org admins access on
  // org-level entitlement alone, with no UserAppAccess row — so the membership
  // role MUST survive into the call. Passing `undefined` here would silently
  // deny every org admin who was never explicitly granted the app.
  it("forwards the caller's membership role and super-admin flag verbatim", async () => {
    authCtx = { ...authCtx, orgRole: "org_admin", isSuperAdmin: true };

    await withOrgAuth(ok)(new Request("http://t/api/channels"));

    expect(getAppAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        orgId: ORG,
        appSlug: "quikchat",
        memberRole: "org_admin",
        isSuperAdmin: true,
      }),
    );
  });

  it("caches the verdict — a second request costs no further access read", async () => {
    await withOrgAuth(ok)(new Request("http://t/api/channels"));
    await withOrgAuth(ok)(new Request("http://t/api/channels"));

    expect(getAppAccess).toHaveBeenCalledTimes(1);
  });

  it("scopes the cache per user — a different caller is evaluated fresh", async () => {
    await withOrgAuth(ok)(new Request("http://t/api/channels"));
    authCtx = { ...authCtx, userId: "u2" };
    getAppAccess.mockResolvedValue({ hasAccess: false, otherAppsCount: 0 });

    const res = await withOrgAuth(ok)(new Request("http://t/api/channels"));

    expect(getAppAccess).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(403);
  });
});

/**
 * The exemptions. These routes MUST stay reachable without QuikChat access, and
 * they stay reachable structurally — none of them goes through `withOrgAuth`.
 * This asserts that structural fact rather than re-testing each handler.
 *
 * `session/validate` is the sharpest: it is the live-revocation probe
 * `SessionGuard` polls, and it is what RETURNS `app_access_revoked`. Gating it
 * would leave a revoked user unable to learn they were revoked. `apps/switcher`
 * is how they then navigate away.
 */
describe("exempt routes never acquire the entitlement gate", () => {
  const EXEMPT = [
    "app/api/health/route.ts",
    "app/api/session/validate/route.ts",
    "app/api/apps/switcher/route.ts",
    "app/api/feature-flags/me/route.ts",
    "app/api/invites/[code]/route.ts", // public preview (GET); accept IS gated
    "app/api/livekit/webhook/route.ts",
    "app/api/internal/provision-roles/route.ts",
    "app/api/uploads/gcs/route.ts",
    "app/api/uploads/local/route.ts",
  ];

  it.each(EXEMPT)("%s does not wrap its handler in withOrgAuth", async (rel) => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    expect(src).not.toMatch(/=\s*withOrgAuth\(|withOrgAuth\(async/);
  });
});
