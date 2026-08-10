import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/screens/route";
import { DELETE } from "@/app/api/screens/[id]/route";

const USER = "user_1";
const TENANT = "tenant_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function listReq() {
  return new NextRequest("http://localhost/api/screens");
}
function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/screens", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function delReq() {
  return new NextRequest("http://localhost/api/screens/s1", { method: "DELETE" });
}

describe("GET /api/screens", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(listReq(), { params: {} } as never);
    expect(res.status).toBe(401);
  });

  it("seeds a Default Screen and returns the org's screens", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtScreen.findFirst.mockResolvedValue({ id: "def" } as never); // default exists
    mockDb.qtScreen.findMany.mockResolvedValue([
      { id: "def", name: "Default Screen", description: "…", isDefault: true, updatedAt: new Date() },
    ] as never);
    const res = await GET(listReq(), { params: {} } as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data[0].name).toBe("Default Screen");
  });
});

describe("POST /api/screens", () => {
  it("400 on empty name", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await POST(postReq({ name: "" }), { params: {} } as never);
    expect(res.status).toBe(400);
  });

  it("creates a screen (201)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtScreen.create.mockResolvedValue({ id: "s2" } as never);
    const res = await POST(postReq({ name: "My Screen" }), { params: {} } as never);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.data.id).toBe("s2");
  });
});

describe("DELETE /api/screens/:id", () => {
  it("refuses to delete the Default Screen", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtScreen.findFirst.mockResolvedValue({ isDefault: true } as never);
    const res = await DELETE(delReq(), { params: { id: "s1" } } as never);
    expect(res.status).toBe(400);
  });

  it("soft-deletes a normal screen", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtScreen.findFirst.mockResolvedValue({ isDefault: false } as never);
    mockDb.qtScreen.update.mockResolvedValue({ id: "s1" } as never);
    const res = await DELETE(delReq(), { params: { id: "s1" } } as never);
    expect(res.status).toBe(200);
  });
});
