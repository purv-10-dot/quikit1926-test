import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// ───────────────────────────────────────────────────────────────────
// settings/users gates via withOrgAuthForResource("construction.users")
// .manage — the NextAuth + getTenantId + userCan pipeline, NOT the
// `@/lib/auth/context` surface the harness mocks. Same passthrough mock
// as the approvals/workflows reference tests.
//
// The POST create/invite flow is the shared 5-step Add User skeleton:
// it seeds default roles, resolves the QuikInfra appId, writes central
// auth.User / OrgMember / UserAppAccess / profile / role rows, and sends
// an invite email. We mock the side-effecting collaborators (seeding,
// appId resolution, module/project reconcilers, mailer, email renderer,
// temp-password + sso classifier) per-file so the route's own gating /
// validation / response shaping runs against mockDb.
// ───────────────────────────────────────────────────────────────────
const _auth: {
  ctx: { orgId: string; userId: string } | null;
  forbidden: boolean;
} = { ctx: null, forbidden: false };

function setAuth(ctx: { orgId: string; userId: string } | null) {
  _auth.ctx = ctx;
  _auth.forbidden = false;
}
function setForbidden() {
  _auth.ctx = { orgId: TEST_TENANT, userId: TEST_USER };
  _auth.forbidden = true;
}

vi.mock("@/lib/api/withOrgAuth", () => {
  const wrap =
    (handler: any) =>
    async (req: NextRequest, routeCtx: any) => {
      if (!_auth.ctx) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
      if (_auth.forbidden) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }
      try {
        return await handler(
          { session: {}, userId: _auth.ctx.userId, orgId: _auth.ctx.orgId },
          req,
          routeCtx ?? { params: {} },
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Operation failed";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    };
  const resource = () => ({
    view: wrap, create: wrap, edit: wrap, delete: wrap,
    approve: wrap, import: wrap, importOrEdit: wrap,
    export: wrap, lock: wrap, manage: wrap,
  });
  return {
    withOrgAuth: (h: any) => wrap(h),
    withOrgAuthForModule: () => (h: any) => wrap(h),
    withOrgAuthForResource: resource,
    forbidden: () =>
      NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

// Side-effect collaborators — neutralised so the route logic is exercised
// in isolation against mockDb.
vi.mock("@/lib/rbac/seedDefaultRoles", () => ({
  seedDefaultRoles: vi.fn(async () => null),
  ensureUserOnRole: vi.fn(async () => {}),
}));
const appIdRef = { id: "app-quikinfra" as string | null };
vi.mock("@/lib/rbac/userCan", () => ({
  getQuikInfraAppId: vi.fn(async () => appIdRef.id),
  userCan: vi.fn(async () => true),
  QUIKINFRA_APP_SLUG: "quikinfra",
}));
vi.mock("@/lib/rbac/applyModuleRevokes", () => ({
  applyModuleRevokes: vi.fn(async () => {}),
  modulesFromRevokes: vi.fn(() => []),
}));
vi.mock("@/lib/rbac/applyProjectAccess", () => ({
  applyProjectAccess: vi.fn(async () => {}),
  loadProjectAccess: vi.fn(async () => []),
}));
vi.mock("@/lib/email/mailer", () => ({
  sendMail: vi.fn(async () => ({ success: true })),
}));
vi.mock("@quikit/shared", async () => {
  const actual = await vi
    .importActual<Record<string, unknown>>("@quikit/shared")
    .catch(() => ({}));
  return {
    ...actual,
    renderInvitationEmail: vi.fn(() => ({ subject: "Invite", html: "<p>x</p>" })),
    generateTempPassword: vi.fn(() => "Mango-Pencil-42"),
  };
});
vi.mock("@quikit/shared/temp-password", () => ({
  generateTempPassword: vi.fn(() => "Mango-Pencil-42"),
}));
vi.mock("@quikit/shared/sso-domain-server", () => ({
  classifySsoProviderAsync: vi.fn(async () => "google"),
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async () => "hashed") },
  hash: vi.fn(async () => "hashed"),
}));

const db = mockDb as any;

const { GET, POST } = await import("@/app/api/settings/users/route");

function reqGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/settings/users${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}
function reqPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/settings/users", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// listUsersCentral composes from orgMember.findMany + profile + role.
// Default everything the repo .map()s over to [] so the happy paths don't
// blow up on undefined.
function stubEmptyListSources() {
  db.orgMember.findMany.mockResolvedValue([]);
  db.cnUserProfile.findMany.mockResolvedValue([]);
  db.cnUserAppRole.findMany.mockResolvedValue([]);
  db.cnUserPermissionExtra.findMany.mockResolvedValue([]);
  db.cnUserProjectAccess.findMany.mockResolvedValue([]);
}

const validInvite = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@acme.io",
  userType: "user",
  invitationMethod: "native",
};

beforeEach(() => {
  resetMockDb();
  setAuth(null);
  appIdRef.id = "app-quikinfra";
  stubEmptyListSources();
});

// ═══════════════════════════════════════════════
// GET /api/settings/users
// ═══════════════════════════════════════════════

describe("GET /api/settings/users", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(reqGET(), { params: {} })).status).toBe(401);
  });

  it("returns 403 when the manage permission is denied", async () => {
    setForbidden();
    expect((await GET(reqGET(), { params: {} })).status).toBe(403);
  });

  it("lists users scoped to the org and returns the {data,total} shape", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.orgMember.findMany.mockResolvedValue([
      {
        status: "active",
        role: "member",
        invitationToken: "tok",
        invitedAt: new Date(),
        acceptedAt: null,
        createdBy: TEST_USER,
        user: {
          id: "u1",
          email: "jane@acme.io",
          firstName: "Jane",
          lastName: "Doe",
          lastSignInAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ]);
    const res = await GET(reqGET(), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.data[0].id).toBe("u1");
    // listUsersCentral scopes orgMember.findMany to the caller's org.
    expect(db.orgMember.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("never leaks the inviteToken in the list payload", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.orgMember.findMany.mockResolvedValue([
      {
        status: "active",
        role: "member",
        invitationToken: "secret-token",
        invitedAt: new Date(),
        acceptedAt: null,
        createdBy: TEST_USER,
        user: {
          id: "u1",
          email: "jane@acme.io",
          firstName: "Jane",
          lastName: "Doe",
          lastSignInAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ]);
    const res = await GET(reqGET(), { params: {} });
    const body = await res.json();
    expect(body.data[0].inviteToken).toBeUndefined();
  });

  it("passes the search term down to the membership query", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    await GET(reqGET("search=jane"), { params: {} });
    const where = db.orgMember.findMany.mock.calls[0][0].where;
    expect(where.AND).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
// POST /api/settings/users — invite/create
// ═══════════════════════════════════════════════

describe("POST /api/settings/users — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(reqPOST(validInvite), { params: {} })).status).toBe(401);
  });

  it("returns 403 when the manage permission is denied", async () => {
    setForbidden();
    expect((await POST(reqPOST(validInvite), { params: {} })).status).toBe(403);
  });
});

describe("POST /api/settings/users — validation", () => {
  beforeEach(() => setAuth({ orgId: TEST_TENANT, userId: TEST_USER }));

  it("returns 400 when names/email are missing", async () => {
    const res = await POST(reqPOST({ userType: "user" }), { params: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 500 when the app registry is missing (appId null)", async () => {
    // appId is needed to resolve the role; the route returns 500 with
    // "App registry missing" when getQuikInfraAppId resolves null.
    appIdRef.id = null;
    const res = await POST(reqPOST(validInvite), { params: {} });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/app registry/i);
  });

  it("returns 400 for an unknown role", async () => {
    db.cnAppRole.findFirst.mockResolvedValue(null);
    const res = await POST(reqPOST({ ...validInvite, userType: "wizard" }), {
      params: {},
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown role/i);
  });

  it("returns 400 for a malformed email", async () => {
    db.cnAppRole.findFirst.mockResolvedValue({
      id: "role-user",
      name: "user",
      description: "",
    });
    const res = await POST(reqPOST({ ...validInvite, email: "not-an-email" }), {
      params: {},
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid email/i);
  });

  it("returns 409 when the email already belongs to an org member", async () => {
    db.cnAppRole.findFirst.mockResolvedValue({
      id: "role-user",
      name: "user",
      description: "",
    });
    db.user.findUnique.mockResolvedValue({ id: "existing", email: "jane@acme.io" });
    db.orgMember.findUnique.mockResolvedValue({ id: "m1" });
    const res = await POST(reqPOST(validInvite), { params: {} });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already exists/i);
  });
});

describe("POST /api/settings/users — happy path", () => {
  beforeEach(() => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnAppRole.findFirst.mockResolvedValue({
      id: "role-user",
      name: "user",
      description: "Standard user",
    });
    // No pre-existing auth.User / membership.
    db.user.findUnique.mockResolvedValue(null);
    db.orgMember.findUnique.mockResolvedValue(null);
    // Central writes succeed.
    db.user.upsert.mockResolvedValue({ id: "u-new" });
    db.orgMember.upsert.mockResolvedValue({ id: "m-new" });
    db.userAppAccess.findFirst.mockResolvedValue(null);
    db.userAppAccess.create.mockResolvedValue({ id: "a-new" });
    db.cnUserProfile.upsert.mockResolvedValue({ id: "p-new" });
    db.org.findUnique.mockResolvedValue({ name: "Acme", brandColor: null });
    db.app.findUnique.mockResolvedValue({ name: "QuikInfra" });
  });

  it("creates a native invite scoped to the org and returns 201", async () => {
    const res = await POST(reqPOST(validInvite), { params: {} });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("jane@acme.io");
    expect(body.roleKey).toBe("user");
    expect(body.invite).not.toBeNull();
    // Central auth.User + OrgMember writes scoped to the caller's org.
    expect(db.orgMember.upsert.mock.calls[0][0].create.orgId).toBe(TEST_TENANT);
    expect(db.user.upsert.mock.calls[0][0].where.email).toBe("jane@acme.io");
  });

  it("resolves the role lookup against the caller's org + app", async () => {
    await POST(reqPOST(validInvite), { params: {} });
    const where = db.cnAppRole.findFirst.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
    expect(where.appId).toBe("app-quikinfra");
    expect(where.name).toBe("user");
  });
});
