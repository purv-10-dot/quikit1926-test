import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { GET } from "@/app/api/org/users/search/route";

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

describe("GET /api/org/users/search", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET(makeReq("/api/org/users/search?q=a"));
    expect(res.status).toBe(401);
  });

  it("403s when the caller is a non-admin member", async () => {
    asMember();

    const res = await GET(makeReq("/api/org/users/search?q=a"));
    expect(res.status).toBe(403);
    // Gate blocks before the member directory is searched.
    expect(mockDb.orgMember.findMany).not.toHaveBeenCalled();
  });

  it("returns matching members flagged with QuikAsset access", async () => {
    asAdmin();
    mockDb.orgMember.findMany.mockResolvedValue([
      { user: { id: "u1", email: "a@x.com", firstName: "Al", lastName: "Ice", avatar: null } },
    ] as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);

    const res = await GET(makeReq("/api/org/users/search?q=al"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].hasQuikAssetAccess).toBe(true);
  });

  it("excludes soft-removed users from results (matches the list GET's removedUserIds filter)", async () => {
    asAdmin();
    mockDb.orgMember.findMany.mockResolvedValue([
      { user: { id: "u1", email: "a@x.com", firstName: "Al", lastName: "Ice", avatar: null } },
      { user: { id: "u2", email: "b@x.com", firstName: "Bo", lastName: "Bee", avatar: null } },
    ] as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    // u2 is soft-removed from QuikAsset.
    mockDb.astUserRemoval.findMany.mockResolvedValue([{ userId: "u2" }] as never);
    // Both still hold a UserAppAccess row (soft-delete never removes it) — the bug
    // was u2 surfacing as "has access". Only u1 should come back now.
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);

    const res = await GET(makeReq("/api/org/users/search?q=x"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.map((u: { userId: string }) => u.userId)).toEqual(["u1"]);
    // The removal lookup is org-scoped over the matched candidates.
    const rmCall = mockDb.astUserRemoval.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; userId: { in: string[] } };
    };
    expect(rmCall.where.orgId).toBe("org1");
    expect(rmCall.where.userId.in).toEqual(["u1", "u2"]);
  });

  it("scopes the member search to the caller's org", async () => {
    asAdmin("org-A");
    mockDb.orgMember.findMany.mockResolvedValue([] as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);

    await GET(makeReq("/api/org/users/search?q=z"));

    const call = mockDb.orgMember.findMany.mock.calls[0]?.[0] as { where: { orgId: string } };
    expect(call.where.orgId).toBe("org-A");
  });
});
