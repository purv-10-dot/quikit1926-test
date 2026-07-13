import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/checklist/statuses/route";
import { PATCH, DELETE } from "@/app/api/checklist/statuses/[statusId]/route";

const USER = "user_1";
const TENANT = "tenant_1";
const STATUS = "cst_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
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

describe("GET /api/checklist/statuses", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(jsonReq("/api/checklist/statuses", "GET"), { params: {} } as never);
    expect(res.status).toBe(401);
  });

  it("returns the caller's statuses", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await GET(jsonReq("/api/checklist/statuses", "GET"), { params: {} } as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe("POST /api/checklist/statuses", () => {
  it("400 when name missing", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await POST(jsonReq("/api/checklist/statuses", "POST", { color: "#2563eb" }), {
      params: {},
    } as never);
    expect(res.status).toBe(400);
  });

  it("400 on bad color", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await POST(jsonReq("/api/checklist/statuses", "POST", { name: "Blocked", color: "red" }), {
      params: {},
    } as never);
    expect(res.status).toBe(400);
  });

  it("201 on create", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await POST(
      jsonReq("/api/checklist/statuses", "POST", { name: "Blocked", color: "#ef4444" }),
      { params: {} } as never,
    );
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/checklist/statuses/:statusId", () => {
  it("404 when not the caller's status", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.$executeRaw.mockResolvedValue(0 as never);
    const res = await PATCH(jsonReq(`/api/checklist/statuses/${STATUS}`, "PATCH", { name: "X" }), {
      params: { statusId: STATUS },
    } as never);
    expect(res.status).toBe(404);
  });

  it("200 on rename", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.$executeRaw.mockResolvedValue(1 as never);
    const res = await PATCH(jsonReq(`/api/checklist/statuses/${STATUS}`, "PATCH", { name: "X" }), {
      params: { statusId: STATUS },
    } as never);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/checklist/statuses/:statusId", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(jsonReq(`/api/checklist/statuses/${STATUS}`, "DELETE"), {
      params: { statusId: STATUS },
    } as never);
    expect(res.status).toBe(401);
  });

  it("200 on soft-delete", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.$executeRaw.mockResolvedValue(1 as never);
    const res = await DELETE(jsonReq(`/api/checklist/statuses/${STATUS}`, "DELETE"), {
      params: { statusId: STATUS },
    } as never);
    expect(res.status).toBe(200);
  });
});
