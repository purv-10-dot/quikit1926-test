import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

vi.mock("@/lib/api/seedAppRoles", () => ({
  seedAllDefaultRoles: vi.fn(async () => ({ adminRoleId: "admin-role", memberRoleId: "member-role" })),
  ensureUserOnRole: vi.fn(async () => {}),
}));

import { GET, POST } from "@/app/api/org/users/route";
import { ensureUserOnRole } from "@/lib/api/seedAppRoles";

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

  it("search (q) matches the login user OR the linked employee (union)", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }] as never);
    // u1 matches on user name/email; u2 matches on employee fields only.
    mockDb.user.findMany.mockResolvedValue([{ id: "u1" }] as never);
    mockDb.astEmployee.findMany.mockResolvedValue([{ userId: "u2" }] as never);
    mockDb.orgMember.findMany.mockResolvedValue([membershipRow()] as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      { userId: "u1", role: { id: "r1", name: "Member" } },
    ] as never);

    await GET(makeReq("/api/org/users?q=ali"));

    // The user-side search targets name + email, case-insensitive.
    const userCall = mockDb.user.findMany.mock.calls[0]?.[0] as { where: { OR: unknown[] } };
    expect(userCall.where.OR).toEqual([
      { firstName: { contains: "ali", mode: "insensitive" } },
      { lastName: { contains: "ali", mode: "insensitive" } },
      { email: { contains: "ali", mode: "insensitive" } },
    ]);
    // Candidates are narrowed to the union of user- and employee-side matches.
    const memberCall = mockDb.orgMember.findMany.mock.calls[0]?.[0] as {
      where: { userId: { in: string[] } };
    };
    expect(memberCall.where.userId.in.sort()).toEqual(["u1", "u2"]);
  });

  it("filters by department via the linked employee", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }] as never);
    // Only u1 is in Engineering (dept-narrow call + later the join call reuse this).
    mockDb.astEmployee.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    mockDb.orgMember.findMany.mockResolvedValue([membershipRow()] as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      { userId: "u1", role: { id: "r1", name: "Member" } },
    ] as never);

    await GET(makeReq("/api/org/users?department=Engineering"));

    const deptCall = mockDb.astEmployee.findMany.mock.calls[0]?.[0] as {
      where: { department?: string };
    };
    expect(deptCall.where.department).toBe("Engineering");
    const memberCall = mockDb.orgMember.findMany.mock.calls[0]?.[0] as {
      where: { userId: { in: string[] } };
    };
    expect(memberCall.where.userId.in).toEqual(["u1"]);
  });

  it("joins the linked employee record onto each row", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    mockDb.orgMember.findMany.mockResolvedValue([membershipRow()] as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      { userId: "u1", role: { id: "r1", name: "Member" } },
    ] as never);
    mockDb.astEmployee.findMany.mockResolvedValue([
      {
        userId: "u1",
        employeeId: "EMP-1",
        contact: "999",
        department: "Eng",
        designation: "Dev",
        joiningDate: "2026-01-01",
        status: "Active",
      },
    ] as never);

    const res = await GET(makeReq("/api/org/users"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data[0].employeeId).toBe("EMP-1");
    expect(json.data[0].department).toBe("Eng");
    expect(json.data[0].employeeStatus).toBe("Active");
  });

  it("returns null employee fields when the user has no linked employee", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    mockDb.orgMember.findMany.mockResolvedValue([membershipRow()] as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      { userId: "u1", role: { id: "r1", name: "Member" } },
    ] as never);
    mockDb.astEmployee.findMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("/api/org/users"));
    const json = await res.json();
    expect(json.data[0].employeeId).toBeNull();
    expect(json.data[0].department).toBeNull();
  });

  it("self-heals a role-less user to Member (persisted + reflected in the row)", async () => {
    asAdmin();
    vi.mocked(ensureUserOnRole).mockClear();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    mockDb.orgMember.findMany.mockResolvedValue([membershipRow()] as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([] as never); // u1 has NO app role
    mockDb.astEmployee.findMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("/api/org/users"));
    const json = await res.json();
    expect(res.status).toBe(200);
    // memberRoleId "member-role" comes from the mocked seedAllDefaultRoles.
    expect(ensureUserOnRole).toHaveBeenCalledWith("u1", "org1", "member-role");
    expect(json.data[0].appRoleName).toBe("Member");
  });

  it("never overwrites an existing custom role (e.g. 'IT team')", async () => {
    asAdmin();
    vi.mocked(ensureUserOnRole).mockClear();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    mockDb.orgMember.findMany.mockResolvedValue([membershipRow()] as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      { userId: "u1", role: { id: "it-team", name: "IT team" } },
    ] as never);
    mockDb.astEmployee.findMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("/api/org/users"));
    const json = await res.json();
    expect(json.data[0].appRoleName).toBe("IT team");
    expect(ensureUserOnRole).not.toHaveBeenCalled();
  });

  it("400s on an invalid status value", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);

    const res = await GET(makeReq("/api/org/users?status=bogus"));
    expect(res.status).toBe(400);
  });

  it("excludes soft-removed users from the list", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }] as never);
    // u2 is soft-removed → filtered out of the candidate set.
    mockDb.astUserRemoval.findMany.mockResolvedValue([{ userId: "u2" }] as never);
    mockDb.orgMember.findMany.mockResolvedValue([membershipRow()] as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      { userId: "u1", role: { id: "r1", name: "Member" } },
    ] as never);

    await GET(makeReq("/api/org/users"));

    const memberCall = mockDb.orgMember.findMany.mock.calls[0]?.[0] as {
      where: { userId: { in: string[] } };
    };
    expect(memberCall.where.userId.in).toEqual(["u1"]); // u2 removed
  });

  it("403s a soft-removed admin (access-gating)", async () => {
    asAdmin();
    // The caller themselves is soft-removed → requireAdmin denies.
    mockDb.astUserRemoval.findUnique.mockResolvedValue({ id: "rm1" } as never);

    const res = await GET(makeReq("/api/org/users"));
    expect(res.status).toBe(403);
    // Gate fires before the directory is queried.
    expect(mockDb.userAppAccess.findMany).not.toHaveBeenCalled();
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
    mockDb.astEmployee.findFirst.mockResolvedValue(null as never);
    mockDb.astEmployee.findMany.mockResolvedValue([] as never);
    mockDb.astEmployee.create.mockResolvedValue({
      employeeId: "EMP-0001",
      contact: null,
      department: null,
      designation: null,
      joiningDate: null,
      status: "Active",
    } as never);

    const res = await POST(
      makeReq("/api/org/users", {
        method: "POST",
        body: {
          firstName: "New",
          lastName: "Person",
          email: "new@x.com",
          invitationMethod: "native",
          employeeId: "EMP-006",
          contact: "555",
          department: "Eng",
        },
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

  // ─── write-time role default (Phase 3 regression guard) ───
  // Locks: a new user with no appRoleId is assigned the org's Member role, and
  // NOT admin. The only exception (admin-less org → first user is admin) is
  // covered by the next test so nobody "simplifies" the default into
  // always-Member and re-opens the admin-lockout hole.
  function stubNewNativeUserCreate() {
    mockDb.user.findUnique.mockResolvedValue(null as never);
    mockDb.user.create.mockResolvedValue({ id: "newuser" } as never);
    mockDb.orgMember.create.mockResolvedValue({} as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findFirst.mockResolvedValue(null as never);
    mockDb.userAppAccess.create.mockResolvedValue({} as never);
    mockDb.orgMember.findUnique.mockResolvedValue(membershipRow() as never);
    mockDb.org.findUnique.mockResolvedValue({ name: "Acme", brandColor: null } as never);
    // Phase 5: the unified Add also creates a linked employee.
    mockDb.astEmployee.findFirst.mockResolvedValue(null as never);
    mockDb.astEmployee.findMany.mockResolvedValue([] as never);
    mockDb.astEmployee.create.mockResolvedValue({
      employeeId: "EMP-0001",
      contact: null,
      department: null,
      designation: null,
      joiningDate: null,
      status: "Active",
    } as never);
  }

  it("defaults a new user (no appRoleId) to the Member role, never admin", async () => {
    asAdmin();
    vi.mocked(ensureUserOnRole).mockClear();
    stubNewNativeUserCreate();
    mockDb.astUserAppRole.count.mockResolvedValue(1 as never); // org already has an admin

    const res = await POST(
      makeReq("/api/org/users", {
        method: "POST",
        body: {
          firstName: "New",
          lastName: "Person",
          email: "new@x.com",
          employeeId: "EMP-006",
          contact: "555",
          department: "Eng",
        },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.appRoleName).toBe("Member");
    // memberRoleId comes from the mocked seedAllDefaultRoles → "member-role".
    expect(ensureUserOnRole).toHaveBeenCalledWith("newuser", "org1", "member-role", "admin");
  });

  it("makes the first user in an admin-less org an admin (safety exception)", async () => {
    asAdmin();
    vi.mocked(ensureUserOnRole).mockClear();
    stubNewNativeUserCreate();
    mockDb.astUserAppRole.count.mockResolvedValue(0 as never); // NO admin yet

    const res = await POST(
      makeReq("/api/org/users", {
        method: "POST",
        body: {
          firstName: "First",
          lastName: "Admin",
          email: "first@x.com",
          employeeId: "EMP-007",
          contact: "555",
          department: "Eng",
        },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.appRoleName).toBe("admin");
    expect(ensureUserOnRole).toHaveBeenCalledWith("newuser", "org1", "admin-role", "admin");
  });

  // ─── unified Add: login + linked AstEmployee, required fields (Phase 5/6) ───
  it("creates a linked employee for a brand-new user with the supplied Employee ID", async () => {
    asAdmin();
    stubNewNativeUserCreate();
    mockDb.astUserAppRole.count.mockResolvedValue(1 as never);
    mockDb.astEmployee.create.mockResolvedValue({
      employeeId: "EMP-006",
      contact: "555",
      department: "Eng",
      designation: null,
      joiningDate: null,
      status: "Active",
    } as never);

    const res = await POST(
      makeReq("/api/org/users", {
        method: "POST",
        body: {
          firstName: "New",
          lastName: "Person",
          email: "new@x.com",
          employeeId: "EMP-006",
          contact: "555",
          department: "Eng",
        },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(mockDb.astEmployee.create).toHaveBeenCalledOnce();
    const createArg = mockDb.astEmployee.create.mock.calls[0]?.[0] as {
      data: { userId: string; name: string; employeeId: string };
    };
    expect(createArg.data.userId).toBe("newuser"); // linked via the identity bridge
    expect(createArg.data.name).toBe("New Person");
    expect(createArg.data.employeeId).toBe("EMP-006"); // admin-supplied id (no auto-gen)
    expect(json.data.employeeId).toBe("EMP-006");
  });

  it("rejects a brand-new user missing required Employee ID / Contact / Department", async () => {
    asAdmin();
    mockDb.user.findUnique.mockResolvedValue(null as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astEmployee.findFirst.mockResolvedValue(null as never); // no existing employee → fields required

    const res = await POST(
      makeReq("/api/org/users", {
        method: "POST",
        body: { firstName: "No", lastName: "Fields", email: "missing@x.com" },
      }),
    );

    expect(res.status).toBe(400);
    // Validated before any login is created.
    expect(mockDb.user.create).not.toHaveBeenCalled();
  });

  it("links an existing employee by email instead of duplicating it", async () => {
    asAdmin();
    stubNewNativeUserCreate();
    mockDb.astUserAppRole.count.mockResolvedValue(1 as never);
    // (1) existing-employee gate finds it (by email) → required fields skipped;
    // (2) ensureLinkedEmployee by userId → none; (3) by email → found, unlinked.
    mockDb.astEmployee.findFirst
      .mockResolvedValueOnce({ id: "emp-x" } as never)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({
        id: "emp-x",
        userId: null,
        contact: null,
        department: null,
        designation: null,
        joiningDate: null,
      } as never);
    mockDb.astEmployee.update.mockResolvedValue({
      employeeId: "EMP-OLD",
      contact: null,
      department: null,
      designation: null,
      joiningDate: null,
      status: "Active",
    } as never);

    const res = await POST(
      makeReq("/api/org/users", {
        method: "POST",
        body: { firstName: "New", lastName: "Person", email: "existing@x.com" },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(mockDb.astEmployee.update).toHaveBeenCalledOnce(); // linked in place
    expect(mockDb.astEmployee.create).not.toHaveBeenCalled(); // never duplicated
    const updateArg = mockDb.astEmployee.update.mock.calls[0]?.[0] as { data: { userId: string } };
    expect(updateArg.data.userId).toBe("newuser");
    expect(json.data.employeeId).toBe("EMP-OLD");
  });

  it("rejects a supplied Employee ID already in use, before creating the login", async () => {
    asAdmin();
    mockDb.user.findUnique.mockResolvedValue(null as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    // (1) existing-employee gate → none (creating new; required fields supplied);
    // (2) employeeId clash check → found → 409.
    mockDb.astEmployee.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ id: "emp-existing" } as never);

    const res = await POST(
      makeReq("/api/org/users", {
        method: "POST",
        body: {
          firstName: "New",
          lastName: "Person",
          email: "new@x.com",
          employeeId: "EMP-001",
          contact: "555",
          department: "Eng",
        },
      }),
    );

    expect(res.status).toBe(409);
    expect(mockDb.user.create).not.toHaveBeenCalled();
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

  // ─── soft-removed member is re-addable (dead-end fix) ───
  // Soft-delete only records an AstUserRemoval marker; the OrgMember, access,
  // role and employee are all retained. Re-adding via manual email must clear
  // the marker and restore — NOT 409 with "pick them from the dropdown" (the
  // dropdown excludes removed users, so that was a dead end).
  it("re-adds a soft-removed member via manual email — clears the marker, no duplicate membership, no temp password", async () => {
    asAdmin();
    vi.mocked(ensureUserOnRole).mockClear();
    mockDb.user.findUnique.mockResolvedValue({ id: "u1" } as never); // existing platform user
    mockDb.orgMember.findUnique.mockResolvedValue(membershipRow() as never); // already a member
    // findUnique fires twice, in order: requireAdmin checks the caller (admin →
    // not removed), then Path B checks the target (u1 → removed).
    mockDb.astUserRemoval.findUnique
      .mockResolvedValueOnce(null as never) // caller (admin) not removed
      .mockResolvedValueOnce({ id: "rm1" } as never); // target u1 is soft-removed
    mockDb.astUserRemoval.deleteMany.mockResolvedValue({ count: 1 } as never);
    // Retained employee → skips the required-fields gate AND short-circuits
    // ensureLinkedEmployee (already linked to u1).
    mockDb.astEmployee.findFirst.mockResolvedValue({
      id: "emp-1", userId: "u1", employeeId: "EMP-1",
      contact: null, department: null, designation: null, joiningDate: null, status: "Active",
    } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findFirst.mockResolvedValue({ id: "acc" } as never); // access retained
    mockDb.astUserAppRole.count.mockResolvedValue(1 as never); // org already has an admin

    const res = await POST(
      makeReq("/api/org/users", {
        method: "POST",
        body: { firstName: "Al", lastName: "Ice", email: "a@x.com" },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    // The removal marker is cleared → user reappears in lists and access is re-enabled.
    expect(mockDb.astUserRemoval.deleteMany).toHaveBeenCalledWith({
      where: { orgId: "org1", userId: "u1" },
    });
    expect(mockDb.orgMember.create).not.toHaveBeenCalled(); // membership already exists
    expect(mockDb.userAppAccess.create).not.toHaveBeenCalled(); // access retained
    expect(ensureUserOnRole).toHaveBeenCalledWith("u1", "org1", "member-role", "admin");
    // Existing user keeps their credentials — no onboarding temp password.
    expect(json.data.tempPassword).toBeUndefined();
    expect(json.meta.newUserCreated).toBe(false);
  });

  it("still 409s a genuinely-active member (not soft-removed)", async () => {
    asAdmin();
    mockDb.user.findUnique.mockResolvedValue({ id: "u1" } as never);
    mockDb.orgMember.findUnique.mockResolvedValue(membershipRow() as never);
    mockDb.astUserRemoval.findUnique.mockResolvedValue(null as never); // neither caller nor u1 removed
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp-1" } as never); // skip required-fields gate

    const res = await POST(
      makeReq("/api/org/users", {
        method: "POST",
        body: { firstName: "Al", lastName: "Ice", email: "a@x.com" },
      }),
    );

    expect(res.status).toBe(409);
    expect(mockDb.astUserRemoval.deleteMany).not.toHaveBeenCalled();
    expect(mockDb.orgMember.create).not.toHaveBeenCalled();
  });
});
