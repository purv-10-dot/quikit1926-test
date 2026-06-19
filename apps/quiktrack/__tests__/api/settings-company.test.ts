import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/settings/company/route";

const USER = "user_1";
const TENANT = "tenant_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/settings/company", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/settings/company"),
      { params: {} } as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when user record is missing", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.user.findUnique.mockResolvedValue(null);
    const res = await GET(
      new NextRequest("http://localhost/api/settings/company"),
      { params: {} } as never,
    );
    expect(res.status).toBe(404);
  });

  it("returns the user's accentColor + themeMode", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.user.findUnique.mockResolvedValue({
      accentColor: "blue",
      themeMode: "light",
    } as never);

    const res = await GET(
      new NextRequest("http://localhost/api/settings/company"),
      { params: {} } as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ accentColor: "blue", themeMode: "light" });

    const call = mockDb.user.findUnique.mock.calls[0]?.[0] as { where: { id: string } };
    expect(call.where.id).toBe(USER);
  });
});
