import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/apps/switcher/route";

const USER = "user_1";
const TENANT = "tenant_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/apps/switcher", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns only apps the user has UserAppAccess to", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });

    mockDb.app.findMany.mockResolvedValue([
      { id: "app_a", slug: "a", name: "A" },
      { id: "app_b", slug: "b", name: "B" },
      { id: "app_c", slug: "c", name: "C" },
    ] as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([
      { appId: "app_a" },
      { appId: "app_c" },
    ] as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const slugs = body.data.map((a: { slug: string }) => a.slug);
    expect(slugs).toEqual(["a", "c"]);
  });

  it("falls back to first active membership when session has no orgId", async () => {
    setSession({ id: USER, orgId: "", role: "member" });

    mockDb.orgMember.findFirst.mockResolvedValue({ orgId: TENANT } as never);
    mockDb.app.findMany.mockResolvedValue([
      { id: "app_a", slug: "a", name: "A" },
    ] as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([
      { appId: "app_a" },
    ] as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockDb.orgMember.findFirst).toHaveBeenCalled();
    const accessCall = mockDb.userAppAccess.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string };
    };
    expect(accessCall.where.orgId).toBe(TENANT);
  });
});
