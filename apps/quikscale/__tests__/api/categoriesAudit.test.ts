import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/categories/route";
import { GET as LOGS_GET } from "@/app/api/categories/logs/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-cat-1";
const params = { params: {} as never };

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/categories", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
function buildGET(): NextRequest {
  return new NextRequest("http://localhost/api/categories/logs", { method: "GET" });
}

function asAuthed() {
  setSession({ id: USER, orgId: TENANT, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({
    id: "m1", userId: USER, orgId: TENANT, role: "admin", status: "active",
  } as never);
  mockDb.app.findUnique.mockResolvedValue({ id: "app1", slug: "quikscale" } as never);
  mockDb.userAppAccess.findUnique.mockResolvedValue({ id: "access1" } as never);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("POST /api/categories — audit", () => {
  beforeEach(asAuthed);

  it("writes a CREATE audit entry on the shared category channel", async () => {
    mockDb.categoryMaster.create.mockResolvedValue({
      id: "cat-1", name: "Revenue", dataType: "Number", currency: null,
      categoryType: "Cumulative", description: null,
    } as never);
    mockDb.auditLog.create.mockResolvedValue({} as never);

    const res = await POST(
      buildPOST({ name: "Revenue", dataType: "Number", categoryType: "Cumulative" }),
      params,
    );

    expect(res.status).toBe(201);
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
    const data = (mockDb.auditLog.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data.entityType).toBe("Category");
    expect(data.entityId).toBe("category-mgmt");
    expect(data.action).toBe("CREATE");
  });
});

describe("GET /api/categories/logs", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await LOGS_GET(buildGET(), params);
    expect(res.status).toBe(401);
  });

  it("returns normalized category logs with actor names", async () => {
    asAuthed();
    mockDb.auditLog.findMany.mockResolvedValue([
      {
        id: "l1",
        action: "UPDATE",
        oldValues: JSON.stringify({ name: "Revenue", categoryType: "Cumulative" }),
        newValues: JSON.stringify({ name: "Revenue", categoryType: "Standalone" }),
        changes: ["categoryType"],
        actorId: USER,
        createdAt: new Date("2026-06-04T10:00:00Z"),
      },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: USER, firstName: "Pravin", lastName: "Sharma" },
    ] as never);

    const res = await LOGS_GET(buildGET(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data[0].action).toBe("UPDATE");
    expect(body.data[0].name).toBe("Revenue");
    expect(body.data[0].actorName).toBe("Pravin Sharma");
    expect(body.data[0].newValues.categoryType).toBe("Standalone");
  });
});
