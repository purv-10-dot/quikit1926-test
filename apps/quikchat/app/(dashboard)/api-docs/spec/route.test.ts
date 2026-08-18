import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getRawSession: vi.fn(),
  getSessionPrincipal: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
/**
 * `getAppAccess` issues four real Prisma queries, and this file has no mockDb
 * harness — a docs test should not acquire a database dependency to prove a
 * gate. The cost of stubbing it is real and worth stating plainly: these tests
 * no longer exercise the entitlement RULES at all (org enablement, trial
 * expiry, the admin-tier bypass). Those live in packages/auth's own
 * __tests__/app-access.test.ts.
 *
 * What that leaves load-bearing here is the argument-set assertion below. It
 * compares the WHOLE call object, not a subset, precisely so a dropped
 * `memberRole` — the failure mode that would silently deny org admins — cannot
 * sail through.
 */
vi.mock("@quikit/auth/app-access", () => ({ getAppAccess: vi.fn() }));

import { getAppAccess } from "@quikit/auth/app-access";
import { getSessionPrincipal } from "@/lib/session";
import { GET } from "./route";

const mockedSession = vi.mocked(getSessionPrincipal);
const mockedAppAccess = vi.mocked(getAppAccess);

const PRINCIPAL = {
  userId: "u1",
  orgId: "o1",
  isSuperAdmin: false,
  // A concrete role, not undefined: `toHaveBeenCalledWith` ignores keys whose
  // value is undefined, so a real value is what makes a dropped `memberRole`
  // actually fail the assertion.
  membershipRole: "admin",
} as const;

/** Authenticated AND entitled — the happy path. */
function signedIn() {
  mockedSession.mockResolvedValue({ ...PRINCIPAL });
  mockedAppAccess.mockResolvedValue({ hasAccess: true, otherAppsCount: 0 });
}

beforeEach(() => {
  mockedSession.mockReset();
  mockedAppAccess.mockReset();
  delete process.env.QUIKCHAT_API_DOCS;
});

afterEach(() => {
  delete process.env.QUIKCHAT_API_DOCS;
});

describe("GET /api-docs/spec", () => {
  it("rejects an unauthenticated caller (401)", async () => {
    mockedSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authenticated" });
  });

  /**
   * The gap this route had: `/api-docs` inherits `requireAppAccess` from the
   * (dashboard) layout, but a route handler runs no layout, so a session-only
   * check let ANY authenticated platform user — with no QuikChat grant at all —
   * read the whole document.
   */
  it("rejects an authenticated caller without QuikChat access (403)", async () => {
    mockedSession.mockResolvedValue({ ...PRINCIPAL });
    mockedAppAccess.mockResolvedValue({ hasAccess: false, otherAppsCount: 2 });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "QuikChat access required" });
  });

  it("does not leak a byte of the spec on the denial path", async () => {
    mockedSession.mockResolvedValue({ ...PRINCIPAL });
    mockedAppAccess.mockResolvedValue({ hasAccess: false, otherAppsCount: 0 });
    const res = await GET();
    expect(await res.text()).not.toContain("openapi:");
  });

  /**
   * Locks the gate SHAPE to the page's. Whole-object comparison on purpose —
   * see the mock note at the top of this file.
   */
  it("asks the same entitlement question the (dashboard) layout asks", async () => {
    signedIn();
    await GET();
    expect(mockedAppAccess).toHaveBeenCalledWith({
      userId: "u1",
      orgId: "o1",
      appSlug: "quikchat",
      isSuperAdmin: false,
      memberRole: "admin",
    });
  });

  it("serves the spec to a signed-in caller (200)", async () => {
    signedIn();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/yaml");
    const body = await res.text();
    expect(body.startsWith("openapi: 3.0.3")).toBe(true);
  });

  it("never lets a shared cache hold the gated spec", async () => {
    signedIn();
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("404s when the ops kill switch is off — before the session is even read", async () => {
    process.env.QUIKCHAT_API_DOCS = "off";
    const res = await GET();
    expect(res.status).toBe(404);
    expect(mockedSession).not.toHaveBeenCalled();
    expect(mockedAppAccess).not.toHaveBeenCalled();
  });

  /**
   * Guards the reason this route is shaped the way it is: the spec is INLINED
   * at build time, not read off disk. A regression to a cwd-relative
   * `fs.readFile` passes in dev and 500s in the container, because
   * apps/quikchat/Dockerfile never copies `docs/`.
   *
   * Serving correctly from an unrelated cwd is the cheap proxy for that. Being
   * precise about its limit: it catches a per-request read, not a read done
   * once at module load (this module is already imported by then). Safe to
   * chdir here — vitest.config.ts sets `fileParallelism: false` with forked
   * pools, so no sibling test file shares this process concurrently.
   */
  it("serves the spec from an unrelated cwd — it is inlined, not read from disk", async () => {
    signedIn();
    const original = process.cwd();
    process.chdir(tmpdir());
    try {
      const res = await GET();
      expect(res.status).toBe(200);
      expect((await res.text()).startsWith("openapi: 3.0.3")).toBe(true);
    } finally {
      process.chdir(original);
    }
  });
});
