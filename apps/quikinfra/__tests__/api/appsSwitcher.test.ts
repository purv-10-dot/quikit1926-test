import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";

// ───────────────────────────────────────────────────────────────────
// /api/apps/switcher authenticates via getServerSession(authOptions) directly
// (no requireAdmin / withOrgAuth). It then queries the SHARED registry tables
// on @quikit/database (mockDb): app, orgAppAccess, userAppAccess, orgMember.
// We mock next-auth's getServerSession + the local authOptions import; the
// session shape drives the admin-tier (ADMIN_TIER_ROLES, real from
// @quikit/shared) and per-user visibility rules.
// ───────────────────────────────────────────────────────────────────
const _session: { value: unknown } = { value: null };
function setSession(value: unknown) {
  _session.value = value;
}
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => _session.value),
}));
vi.mock("@/lib/auth/next-auth-options", () => ({ authOptions: {} }));

const db = mockDb as any;

const { GET } = await import("@/app/api/apps/switcher/route");

beforeEach(() => {
  resetMockDb();
  setSession(null);
  // sensible registry defaults — overridden per test
  db.app.findMany.mockResolvedValue([]);
  db.orgAppAccess.findMany.mockResolvedValue([]);
  db.userAppAccess.findMany.mockResolvedValue([]);
  db.orgMember.findFirst.mockResolvedValue(null);
});

const APPS = [
  {
    id: "a-scale",
    name: "QuikScale",
    slug: "quikscale",
    description: null,
    iconUrl: null,
    baseUrl: "https://scale.example",
    status: "active",
    requiresOrgAdmin: false,
  },
  {
    id: "a-admin",
    name: "Admin",
    slug: "admin",
    description: null,
    iconUrl: null,
    baseUrl: "https://admin.example",
    status: "active",
    requiresOrgAdmin: true,
  },
];

describe("GET /api/apps/switcher", () => {
  it("returns 401 when there is no session", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 when the session has no user id", async () => {
    setSession({ user: {} });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("shows every provisioned app to an org admin (no per-user rows needed)", async () => {
    setSession({
      user: { id: TEST_USER, orgId: TEST_TENANT, membershipRole: "org_admin" },
    });
    db.app.findMany.mockResolvedValue(APPS);
    db.orgAppAccess.findMany.mockResolvedValue([{ appId: "a-scale" }, { appId: "a-admin" }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const slugs = body.data.map((a: { slug: string }) => a.slug).sort();
    expect(slugs).toEqual(["admin", "quikscale"]);
    // org-level entitlement scoped to the caller's org
    expect(db.orgAppAccess.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("hides requiresOrgAdmin apps from a non-admin and needs an explicit UserAppAccess row", async () => {
    setSession({
      user: { id: TEST_USER, orgId: TEST_TENANT, membershipRole: "user" },
    });
    db.app.findMany.mockResolvedValue(APPS);
    db.orgAppAccess.findMany.mockResolvedValue([{ appId: "a-scale" }, { appId: "a-admin" }]);
    db.userAppAccess.findMany.mockResolvedValue([{ appId: "a-scale" }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const slugs = body.data.map((a: { slug: string }) => a.slug);
    // admin app filtered (requiresOrgAdmin); quikscale visible via UserAppAccess
    expect(slugs).toEqual(["quikscale"]);
  });

  it("excludes apps the org has not provisioned", async () => {
    setSession({
      user: { id: TEST_USER, orgId: TEST_TENANT, membershipRole: "org_admin" },
    });
    db.app.findMany.mockResolvedValue(APPS);
    db.orgAppAccess.findMany.mockResolvedValue([]); // nothing provisioned

    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(0);
  });

  it("falls back to the first active membership when orgId is absent from the session", async () => {
    setSession({ user: { id: TEST_USER } });
    db.orgMember.findFirst.mockResolvedValue({ orgId: TEST_TENANT, role: "org_admin" });
    db.app.findMany.mockResolvedValue([APPS[0]]);
    db.orgAppAccess.findMany.mockResolvedValue([{ appId: "a-scale" }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((a: { slug: string }) => a.slug)).toEqual(["quikscale"]);
    expect(db.orgMember.findFirst.mock.calls[0][0].where.userId).toBe(TEST_USER);
    // resolved org used for the entitlement query
    expect(db.orgAppAccess.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});
