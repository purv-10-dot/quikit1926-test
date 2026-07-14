import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

vi.mock("@/lib/api/seedAppRoles", () => ({
  seedAllDefaultRoles: vi.fn(async () => ({ adminRoleId: "admin-role", memberRoleId: "member-role" })),
  ensureUserOnRole: vi.fn(async () => {}),
}));

import { GET, POST } from "@/app/api/org/users/route";

function membershipRow(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    role: "member",
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    invitationToken: "tok-1",
    user: {
      id: "u1",
      firstName: "Al",
      lastName: "Ice",
      email: "a@x.com",
      avatar: null,
      lastSignInAt: null,
    },
    ...over,
  };
}

/** requireAdmin passes when the caller has an active admin-tier membership. */
function asAdmin(orgId = "org1") {
  setSession({ id: "admin", orgId, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({ id: "cm", role: "admin" } as never);
}

/** A non-admin member: active membership, but below admin tier + no admin app role. */
function asMember(orgId = "org1") {
  setSession({ id: "member", orgId, role: "member" });
  mockDb.orgMember.findFirst.mockResolvedValue({ id: "cm", role: "member" } as never);
}

describe("GET /api/org/users", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET(makeReq("/api/org/users"));
    expect(res.status).toBe(401);
  });

  it("403s when the caller is a non-admin member", async () => {
    asMember();

    const res = await GET(makeReq("/api/org/users"));
    expect(res.status).toBe(403);
    // Gate blocks before the directory is ever queried.
    expect(mockDb.userAppAccess.findMany).not.toHaveBeenCalled();
  });

  it("lists members that have QuikAsset access", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    mockDb.orgMember.findMany.mockResolvedValue([membershipRow()] as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      { userId: "u1", role: { id: "r1", name: "Member" } },
    ] as never);

    const res = await GET(makeReq("/api/org/users"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].appRoleName).toBe("Member");
  });

  it("scopes the access lookup to the caller's org", async () => {
    asAdmin("org-A");
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([] as never);

    await GET(makeReq("/api/org/users"));

    const call = mockDb.userAppAccess.findMany.mock.calls[0]?.[0] as { where: { orgId: string } };
    expect(call.where.orgId).toBe("org-A");
  });

  it("filters by roleId — narrows the query to users holding that app role", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }] as never);
    // Only u1 holds the requested role (this single value also feeds the role-map query).
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      { userId: "u1", role: { id: "r1", name: "Member" } },
    ] as never);
    mockDb.orgMember.findMany.mockResolvedValue([membershipRow()] as never);

    const res = await GET(makeReq("/api/org/users?roleId=r1"));
    expect(res.status).toBe(200);

    const roleCall = mockDb.astUserAppRole.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; roleId?: string };
    };
    expect(roleCall.where.orgId).toBe("org1");
    expect(roleCall.where.roleId).toBe("r1");

    // The main membership query only sees the narrowed set (u1, not u2).
    const memberCall = mockDb.orgMember.findMany.mock.calls[0]?.[0] as {
      where: { userId: { in: string[] } };
    };
    expect(memberCall.where.userId.in).toEqual(["u1"]);
  });

  it("filters by roleId=none — users with access but no app role", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }] as never);
    // u1 has a role → excluded; u2 has none → kept.
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      { userId: "u1", role: { id: "r1", name: "Member" } },
    ] as never);
    mockDb.orgMember.findMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("/api/org/users?roleId=none"));
    expect(res.status).toBe(200);

    const roleCall = mockDb.astUserAppRole.findMany.mock.calls[0]?.[0] as {
      where: { roleId?: string };
    };
    expect(roleCall.where.roleId).toBeUndefined(); // "none" applies no roleId constraint

    const memberCall = mockDb.orgMember.findMany.mock.calls[0]?.[0] as {
      where: { userId: { in: string[] } };
    };
    expect(memberCall.where.userId.in).toEqual(["u2"]);
  });

  it("filters by status", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    mockDb.orgMember.findMany.mockResolvedValue([membershipRow()] as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([] as never);

    await GET(makeReq("/api/org/users?status=inactive"));

    const memberCall = mockDb.orgMember.findMany.mock.calls[0]?.[0] as {
      where: { status?: string };
    };
    expect(memberCall.where.status).toBe("inactive");
  });

  it("filters by search query (q) on name + email, case-insensitive", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    mockDb.orgMember.findMany.mockResolvedValue([membershipRow()] as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([] as never);

    await GET(makeReq("/api/org/users?q=ali"));

    const memberCall = mockDb.orgMember.findMany.mock.calls[0]?.[0] as {
      where: { user?: { OR: unknown[] } };
    };
    expect(memberCall.where.user?.OR).toEqual([
      { firstName: { contains: "ali", mode: "insensitive" } },
      { lastName: { contains: "ali", mode: "insensitive" } },
      { email: { contains: "ali", mode: "insensitive" } },
    ]);
  });

  it("400s on an invalid status value", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);

    const res = await GET(makeReq("/api/org/users?status=bogus"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/org/users", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await POST(makeReq("/api/org/users", { method: "POST", body: {} }));
    expect(res.status).toBe(401);
  });

  it("403s when the caller is a non-admin member (no privilege escalation)", async () => {
    asMember();

    const res = await POST(
      makeReq("/api/org/users", {
        method: "POST",
        body: { firstName: "Mal", lastName: "Ory", email: "mal@x.com", role: "admin" },
      }),
    );

    expect(res.status).toBe(403);
    // The gate must block before any account is created / role is granted.
    expect(mockDb.user.create).not.toHaveBeenCalled();
    expect(mockDb.orgMember.create).not.toHaveBeenCalled();
  });

  it("creates a brand-new native user with a generated temp password", async () => {
    asAdmin();
    mockDb.user.findUnique.mockResolvedValue(null as never); // no existing user / inviter
    mockDb.user.create.mockResolvedValue({ id: "newuser" } as never);
    mockDb.orgMember.create.mockResolvedValue({} as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findFirst.mockResolvedValue(null as never);
    mockDb.userAppAccess.create.mockResolvedValue({} as never);
    mockDb.astUserAppRole.count.mockResolvedValue(1 as never); // org already has an admin
    mockDb.orgMember.findUnique.mockResolvedValue(membershipRow() as never);
    mockDb.org.findUnique.mockResolvedValue({ name: "Acme", brandColor: null } as never);

    const res = await POST(
      makeReq("/api/org/users", {
        method: "POST",
        body: { firstName: "New", lastName: "Person", email: "new@x.com", invitationMethod: "native" },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(typeof json.data.tempPassword).toBe("string");
    expect(json.data.appRoleName).toBe("Member");
    expect(json.meta.newUserCreated).toBe(true);
    expect(mockDb.user.create).toHaveBeenCalledOnce();
  });

  it("rejects linking a user who is not a member of the caller's org (isolation)", async () => {
    asAdmin("org-A");
    mockDb.orgMember.findUnique.mockResolvedValue(null as never);

    const res = await POST(
      makeReq("/api/org/users", {
        method: "POST",
        body: { firstName: "X", lastName: "Y", email: "x@y.com", linkExistingUserId: "other-org-user" },
      }),
    );

    expect(res.status).toBe(404);
    const call = mockDb.orgMember.findUnique.mock.calls[0]?.[0] as {
      where: { orgId_userId: { orgId: string } };
    };
    expect(call.where.orgId_userId.orgId).toBe("org-A");
  });
});
