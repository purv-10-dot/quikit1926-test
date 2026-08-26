import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/users/search/route";

const USER = "user_1";
const ORG = "org_1";

function req(query: string) {
  return new NextRequest(`http://localhost/api/users/search?${query}`);
}

function membership(overrides: Partial<{ id: string; email: string; firstName: string; lastName: string }>) {
  return {
    user: {
      id: overrides.id ?? "u1",
      email: overrides.email ?? "user@example.com",
      firstName: overrides.firstName ?? "First",
      lastName: overrides.lastName ?? "Last",
      avatar: null,
    },
  };
}

beforeEach(() => {
  resetMockDb();
  setSession({ id: USER, orgId: ORG, role: "member" });
  mockDb.orgMember.findMany.mockResolvedValue([]);
  mockDb.userAppAccess.findMany.mockResolvedValue([]);
  // getQuikTrackAppId() → db.app.findUnique — without this, appId is falsy
  // and the hasQuikTrackAccess lookup is skipped entirely (always false).
  mockDb.app.findUnique.mockResolvedValue({ id: "app_quiktrack" } as never);
});

describe("GET /api/users/search", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await GET(req("q=Sagar"));
    expect(res.status).toBe(401);
  });

  it("single-token query keeps the original single-OR filter (regression guard)", async () => {
    mockDb.orgMember.findMany.mockResolvedValue([membership({ firstName: "Sagar", lastName: "Roy" })] as never);
    const res = await GET(req("q=Sagar"));
    expect(res.status).toBe(200);
    const call = mockDb.orgMember.findMany.mock.calls[0]![0] as { where: { user: unknown } };
    expect(call.where.user).toEqual({
      OR: [
        { email: { contains: "Sagar", mode: "insensitive" } },
        { firstName: { contains: "Sagar", mode: "insensitive" } },
        { lastName: { contains: "Sagar", mode: "insensitive" } },
      ],
    });
  });

  it('two-token full-name query "Sagar Roy" builds an AND-of-tokens filter, not a single OR on the whole string', async () => {
    mockDb.orgMember.findMany.mockResolvedValue([membership({ firstName: "Sagar", lastName: "Roy" })] as never);
    const res = await GET(req("q=Sagar+Roy"));
    expect(res.status).toBe(200);
    const call = mockDb.orgMember.findMany.mock.calls[0]![0] as { where: { user: { AND?: unknown[] } } };
    expect(call.where.user.AND).toHaveLength(2);
    expect(call.where.user.AND).toEqual([
      {
        OR: [
          { email: { contains: "Sagar", mode: "insensitive" } },
          { firstName: { contains: "Sagar", mode: "insensitive" } },
          { lastName: { contains: "Sagar", mode: "insensitive" } },
        ],
      },
      {
        OR: [
          { email: { contains: "Roy", mode: "insensitive" } },
          { firstName: { contains: "Roy", mode: "insensitive" } },
          { lastName: { contains: "Roy", mode: "insensitive" } },
        ],
      },
    ]);
  });

  it("collapses repeated whitespace between tokens", async () => {
    mockDb.orgMember.findMany.mockResolvedValue([]);
    await GET(req("q=Sagar++++Roy"));
    const call = mockDb.orgMember.findMany.mock.calls[0]![0] as { where: { user: { AND?: unknown[] } } };
    expect(call.where.user.AND).toHaveLength(2);
  });

  it("an empty/whitespace-only query applies no name filter at all", async () => {
    mockDb.orgMember.findMany.mockResolvedValue([]);
    await GET(req("q=+++"));
    const call = mockDb.orgMember.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty("user");
  });

  it("returns matching users with hasQuikTrackAccess computed from userAppAccess", async () => {
    mockDb.orgMember.findMany.mockResolvedValue([
      membership({ id: "u1", firstName: "Sagar", lastName: "Roy" }),
    ] as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    const res = await GET(req("q=Sagar+Roy"));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      {
        id: "u1",
        userId: "u1",
        email: "user@example.com",
        firstName: "Sagar",
        lastName: "Roy",
        avatar: null,
        hasQuikTrackAccess: true,
      },
    ]);
  });
});
