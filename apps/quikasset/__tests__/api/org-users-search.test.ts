import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { GET } from "@/app/api/org/users/search/route";

describe("GET /api/org/users/search", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET(makeReq("/api/org/users/search?q=a"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns matching members flagged with QuikAsset access", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    mockDb.orgMember.findMany.mockResolvedValue([
      { user: { id: "u1", email: "a@x.com", firstName: "Al", lastName: "Ice", avatar: null } },
    ] as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);

    const res = await GET(makeReq("/api/org/users/search?q=al"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].hasQuikAssetAccess).toBe(true);
  });

  it("scopes the member search to the caller's org", async () => {
    setSession({ id: "admin", orgId: "org-A", role: "admin" });
    mockDb.orgMember.findMany.mockResolvedValue([] as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);

    await GET(makeReq("/api/org/users/search?q=z"), { params: {} });

    const call = mockDb.orgMember.findMany.mock.calls[0]?.[0] as { where: { orgId: string } };
    expect(call.where.orgId).toBe("org-A");
  });
});
