import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/client-meetings/clients/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-clients-sort-1";

function buildGET(params = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/client-meetings/clients${params ? "?" + params : ""}`,
  );
}

function asAdmin() {
  setSession({ id: USER, orgId: TENANT, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    orgId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

function makeClient(name: string) {
  return {
    id: `client-${name}`,
    orgId: TENANT,
    name,
    description: null,
    isActive: true,
    startDate: null,
    weeklyStartTime: "11:00",
    weeklyEndTime: "12:00",
    dailyStartTime: "10:00",
    dailyEndTime: "11:00",
    teamMembers: [],
    _count: { memberships: 0 },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdBy: USER,
    updatedBy: null,
    deletedAt: null,
  };
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════════════════════════════════
// Regression: case-insensitive Client Name sort.
//
// Postgres orders text by collation (byte order), so a raw `ORDER BY name`
// groups every uppercase letter ahead of every lowercase one ("Zebra" < "apple"
// because 'Z'(90) < 'a'(97)). Prisma's typed `orderBy` can't express
// case-insensitivity (`mode: "insensitive"` is filter-only), so the route
// re-sorts the `name` column in JS. These tests pin that behaviour by feeding
// `findMany` rows in the broken byte order Postgres would return and asserting
// the handler emits true alphabetical (case-insensitive) order.
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/client-meetings/clients — case-insensitive name sort", () => {
  beforeEach(asAdmin);

  it("sorts names case-insensitively ascending (uppercase no longer floats to the top)", async () => {
    // Simulate Postgres byte-order: all capitals first, then lowercase.
    mockDb.client.findMany.mockResolvedValue(
      ["Mango", "Zebra", "apple", "banana"].map(makeClient) as any,
    );
    mockDb.user.findMany.mockResolvedValue([
      { id: USER, firstName: "Test", lastName: "User" },
    ] as any);

    const res = await GET(buildGET("sortBy=name&sortOrder=asc"), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.map((r: { name: string }) => r.name)).toEqual([
      "apple",
      "banana",
      "Mango",
      "Zebra",
    ]);
    // displayId follows the corrected order.
    expect(body.data.map((r: { displayId: number }) => r.displayId)).toEqual([1, 2, 3, 4]);
  });

  it("sorts names case-insensitively descending", async () => {
    mockDb.client.findMany.mockResolvedValue(
      ["Mango", "Zebra", "apple", "banana"].map(makeClient) as any,
    );
    mockDb.user.findMany.mockResolvedValue([
      { id: USER, firstName: "Test", lastName: "User" },
    ] as any);

    const res = await GET(buildGET("sortBy=name&sortOrder=desc"), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.map((r: { name: string }) => r.name)).toEqual([
      "Zebra",
      "Mango",
      "banana",
      "apple",
    ]);
  });
});
