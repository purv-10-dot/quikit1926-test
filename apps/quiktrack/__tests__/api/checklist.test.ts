import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/checklist/route";
import { PATCH, DELETE } from "@/app/api/checklist/[itemId]/route";

const USER = "user_1";
const TENANT = "tenant_1";
const ITEM = "chk_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
  // Raw-SQL helpers: default to "no rows" for reads so nothing throws.
  mockDb.$queryRaw.mockResolvedValue([] as never);
  mockDb.$executeRaw.mockResolvedValue(1 as never);
});

function jsonReq(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}

describe("GET /api/checklist", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(jsonReq("/api/checklist", "GET"), { params: {} } as never);
    expect(res.status).toBe(401);
  });

  it("returns paginated items + statuses + totals for the caller", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await GET(jsonReq("/api/checklist?offset=0&limit=30", "GET"), { params: {} } as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("items");
    expect(body.data).toHaveProperty("statuses");
    expect(body.data).toHaveProperty("hasMore");
    expect(body.data).toHaveProperty("total");
    expect(body.data).toHaveProperty("checked");
  });
});

describe("POST /api/checklist", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(jsonReq("/api/checklist", "POST", { name: "X" }), { params: {} } as never);
    expect(res.status).toBe(401);
  });

  it("400 when name is missing", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await POST(jsonReq("/api/checklist", "POST", { name: "" }), { params: {} } as never);
    expect(res.status).toBe(400);
  });

  it("201 on create", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await POST(
      jsonReq("/api/checklist", "POST", { name: "Draft report" }),
      { params: {} } as never,
    );
    expect(res.status).toBe(201);
    // Insert happened via raw SQL.
    expect(mockDb.$executeRaw).toHaveBeenCalled();
  });
});

describe("PATCH /api/checklist/:itemId", () => {
  it("401 when unauthenticated", async () => {
    const res = await PATCH(jsonReq(`/api/checklist/${ITEM}`, "PATCH", { isCompleted: true }), {
      params: { itemId: ITEM },
    } as never);
    expect(res.status).toBe(401);
  });

  it("400 on empty patch", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await PATCH(jsonReq(`/api/checklist/${ITEM}`, "PATCH", {}), {
      params: { itemId: ITEM },
    } as never);
    expect(res.status).toBe(400);
  });

  it("404 when the item isn't the caller's", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.$executeRaw.mockResolvedValue(0 as never); // no rows updated
    const res = await PATCH(jsonReq(`/api/checklist/${ITEM}`, "PATCH", { isCompleted: true }), {
      params: { itemId: ITEM },
    } as never);
    expect(res.status).toBe(404);
  });

  it("200 on successful update", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.$executeRaw.mockResolvedValue(1 as never);
    const res = await PATCH(jsonReq(`/api/checklist/${ITEM}`, "PATCH", { name: "Renamed" }), {
      params: { itemId: ITEM },
    } as never);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/checklist/:itemId", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(jsonReq(`/api/checklist/${ITEM}`, "DELETE"), {
      params: { itemId: ITEM },
    } as never);
    expect(res.status).toBe(401);
  });

  it("404 when nothing was deleted", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.$executeRaw.mockResolvedValue(0 as never);
    const res = await DELETE(jsonReq(`/api/checklist/${ITEM}`, "DELETE"), {
      params: { itemId: ITEM },
    } as never);
    expect(res.status).toBe(404);
  });

  it("200 on soft-delete", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.$executeRaw.mockResolvedValue(1 as never);
    const res = await DELETE(jsonReq(`/api/checklist/${ITEM}`, "DELETE"), {
      params: { itemId: ITEM },
    } as never);
    expect(res.status).toBe(200);
  });
});
