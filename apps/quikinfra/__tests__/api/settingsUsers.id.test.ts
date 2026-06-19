import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// settings/users/[id], /search, and /[id]/resend-invite all gate via
// withOrgAuthForResource("construction.users").manage. Same passthrough
// mock + side-effect collaborator mocks as settingsUsers.test.ts.
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
vi.mock("@/lib/rbac/matrixV2Bridge", () => ({
  matrixToRevokes: vi.fn(() => []),
  revokesToMatrix: vi.fn(() => null),
  managedPairs: vi.fn(() => []),
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
  };
});

const db = mockDb as any;
const ID = "u1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/settings/users/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

// A central OrgMember membership row (joined to user) — what
// findUserByIdCentral consumes.
function membership(over: Record<string, any> = {}) {
  return {
    status: "active",
    role: "member",
    invitationToken: null,
    invitedAt: new Date(),
    acceptedAt: null,
    createdBy: TEST_USER,
    user: {
      id: ID,
      email: "jane@acme.io",
      firstName: "Jane",
      lastName: "Doe",
      lastSignInAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...over,
  };
}

const { GET, PUT, PATCH, DELETE } = await import(
  "@/app/api/settings/users/[id]/route"
);
const { GET: SEARCH } = await import("@/app/api/settings/users/search/route");
const { POST: RESEND } = await import(
  "@/app/api/settings/users/[id]/resend-invite/route"
);

beforeEach(() => {
  resetMockDb();
  setAuth(null);
  appIdRef.id = "app-quikinfra";
  // Defaults so the central-repository composition doesn't choke.
  db.cnUserProfile.findUnique.mockResolvedValue(null);
  db.cnUserAppRole.findFirst.mockResolvedValue(null);
  db.cnUserPermissionExtra.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/settings/users/[id]
// ═══════════════════════════════════════════════

describe("GET /api/settings/users/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the manage permission is denied", async () => {
    setForbidden();
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns 404 when the user is not a member of this org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.orgMember.findUnique.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the user scoped to the org (and strips inviteToken)", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.orgMember.findUnique.mockResolvedValue(
      membership({ invitationToken: "secret" }),
    );
    db.user.findUnique.mockResolvedValue(null); // enrichment lookup
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(ID);
    expect(body.inviteToken).toBeUndefined();
    expect(db.orgMember.findUnique.mock.calls[0][0].where).toMatchObject({
      orgId_userId: { orgId: TEST_TENANT, userId: ID },
    });
  });
});

// ═══════════════════════════════════════════════
// PUT / PATCH /api/settings/users/[id]
// ═══════════════════════════════════════════════

describe("PUT/PATCH /api/settings/users/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PUT(req("PUT", { firstName: "X" }), params)).status).toBe(401);
  });

  it("returns 403 when the manage permission is denied", async () => {
    setForbidden();
    expect((await PUT(req("PUT", { firstName: "X" }), params)).status).toBe(403);
  });

  it("returns 400 on an invalid email", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const res = await PUT(req("PUT", { email: "nope" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid email/i);
  });

  it("returns 400 for an unknown role on a role change", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnAppRole.findFirst.mockResolvedValue(null);
    const res = await PUT(req("PUT", { userType: "wizard" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown role/i);
  });

  it("returns 404 when updating a non-member", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    // updateUserCentral existence check (orgMember.findUnique) → null.
    db.orgMember.findUnique.mockResolvedValue(null);
    const res = await PATCH(req("PATCH", { firstName: "X" }), params);
    expect(res.status).toBe(404);
  });

  it("updates profile fields and returns the user", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    // updateUserCentral: existence check + writes, then findUserByIdCentral re-read.
    db.orgMember.findUnique.mockResolvedValue(membership());
    db.cnUserProfile.upsert.mockResolvedValue({ id: "p1" });
    db.user.update.mockResolvedValue({ id: ID });
    const res = await PATCH(
      req("PATCH", { firstName: "Janet", lastName: "Doe" }),
      params,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(ID);
    // profile upsert scoped to the caller's org.
    expect(db.cnUserProfile.upsert.mock.calls[0][0].where).toMatchObject({
      orgId_userId: { orgId: TEST_TENANT, userId: ID },
    });
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/settings/users/[id]
// ═══════════════════════════════════════════════

describe("DELETE /api/settings/users/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the manage permission is denied", async () => {
    setForbidden();
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when the soft-delete target isn't found", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    // softDeleteUserCentral catches a rejected update → returns false → 404.
    db.orgMember.update.mockRejectedValue(new Error("no such row"));
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(404);
  });

  it("soft-deletes (status=inactive) within the org and returns success", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.orgMember.update.mockResolvedValue({ id: "m1", status: "inactive" });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const call = db.orgMember.update.mock.calls[0][0];
    expect(call.where).toMatchObject({
      orgId_userId: { orgId: TEST_TENANT, userId: ID },
    });
    expect(call.data.status).toBe("inactive");
  });
});

// ═══════════════════════════════════════════════
// GET /api/settings/users/search
// ═══════════════════════════════════════════════

function searchReq(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/settings/users/search${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}

describe("GET /api/settings/users/search", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SEARCH(searchReq("email=ja"), { params: {} })).status).toBe(401);
  });

  it("returns 403 when the manage permission is denied", async () => {
    setForbidden();
    expect((await SEARCH(searchReq("email=ja"), { params: {} })).status).toBe(403);
  });

  it("short-circuits to an empty array for queries shorter than 2 chars", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    const res = await SEARCH(searchReq("email=a"), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    // No DB hit on the short-circuit path.
    expect(db.orgMember.findMany).not.toHaveBeenCalled();
  });

  it("returns matching members scoped to the org with hasQuikInfraAccess", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.orgMember.findMany.mockResolvedValue([
      {
        id: "m1",
        status: "active",
        user: {
          id: "u9",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@acme.io",
          avatar: null,
          appAccess: [{ id: "acc1" }],
        },
      },
    ]);
    const res = await SEARCH(searchReq("email=jane"), { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data[0].userId).toBe("u9");
    expect(body.data[0].hasQuikInfraAccess).toBe(true);
    expect(db.orgMember.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

// ═══════════════════════════════════════════════
// POST /api/settings/users/[id]/resend-invite
// ═══════════════════════════════════════════════

describe("POST /api/settings/users/[id]/resend-invite", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await RESEND(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the manage permission is denied", async () => {
    setForbidden();
    expect((await RESEND(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the auth user does not exist", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.user.findUnique.mockResolvedValue(null);
    expect((await RESEND(req("POST"), params)).status).toBe(404);
  });

  it("returns 404 when the user is not a member of this org", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.user.findUnique.mockResolvedValue({
      id: ID,
      email: "jane@acme.io",
      firstName: "Jane",
      lastName: "Doe",
    });
    db.orgMember.findUnique.mockResolvedValue(null);
    expect((await RESEND(req("POST"), params)).status).toBe(404);
  });

  it("returns 409 when the user has already accepted their invite", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.user.findUnique.mockResolvedValue({
      id: ID,
      email: "jane@acme.io",
      firstName: "Jane",
      lastName: "Doe",
    });
    db.orgMember.findUnique.mockResolvedValue({
      acceptedAt: new Date(),
      inviteMethod: "native",
      inviteProvider: null,
    });
    const res = await RESEND(req("POST"), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already accepted/i);
  });

  it("rotates the token, re-sends the email and returns the invite block", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.user.findUnique.mockResolvedValue({
      id: ID,
      email: "jane@acme.io",
      firstName: "Jane",
      lastName: "Doe",
    });
    db.orgMember.findUnique.mockResolvedValue({
      acceptedAt: null,
      inviteMethod: "native",
      inviteProvider: null,
    });
    db.orgMember.update.mockResolvedValue({ id: "m1" });
    db.org.findUnique.mockResolvedValue({ name: "Acme", brandColor: null });
    db.app.findUnique.mockResolvedValue({ name: "QuikInfra" });
    db.cnUserAppRole.findFirst.mockResolvedValue({ role: { name: "user" } });
    const res = await RESEND(req("POST"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.invite.url).toMatch(/invitations\/accept\?token=/);
    // Token rotation scoped to the caller's org.
    expect(db.orgMember.update.mock.calls[0][0].where).toMatchObject({
      orgId_userId: { orgId: TEST_TENANT, userId: ID },
    });
  });

  it("returns 500 when the token rotation write fails", async () => {
    setAuth({ orgId: TEST_TENANT, userId: TEST_USER });
    db.user.findUnique.mockResolvedValue({
      id: ID,
      email: "jane@acme.io",
      firstName: "Jane",
      lastName: "Doe",
    });
    db.orgMember.findUnique.mockResolvedValue({
      acceptedAt: null,
      inviteMethod: "native",
      inviteProvider: null,
    });
    db.orgMember.update.mockRejectedValue(new Error("write failed"));
    const res = await RESEND(req("POST"), params);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/rotate/i);
  });
});
