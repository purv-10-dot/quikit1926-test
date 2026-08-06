/**
 * FR-RE Slice 0 — route GATING for the new builder/runtime endpoints.
 *
 * Admin write/list endpoints (sets, fields) require auth + assertModule. The
 * runtime endpoint is agent-facing: it requires AUTH but NOT the settings gate
 * (agents read the live form they fill), so we only assert it rejects 401.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

mockDb();

function jsonReq(method: string, body?: unknown) {
  return new Request("http://test/api/forms", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as import("next/server").NextRequest;
}
const versionParams = { params: Promise.resolve({ versionId: "ver_1" }) };
const fieldParams = { params: Promise.resolve({ fieldId: "fld_1" }) };

beforeEach(() => {
  setSession(null);
  vi.mocked(assertModule).mockReset();
  vi.mocked(assertModule).mockResolvedValue(undefined);
});

describe("admin builder routes — unauthenticated => 401", () => {
  it("POST /sets", async () => {
    const { POST } = await import("@/app/api/forms/sets/route");
    expect((await POST(jsonReq("POST", { name: "X" }))).status).toBe(401);
  });
  it("GET /sets", async () => {
    const { GET } = await import("@/app/api/forms/sets/route");
    expect((await GET(jsonReq("GET"))).status).toBe(401);
  });
  it("POST /versions/[versionId]/fields", async () => {
    const { POST } = await import("@/app/api/forms/versions/[versionId]/fields/route");
    expect((await POST(jsonReq("POST", { fieldKey: "f", label: "F", fieldType: "text", sortOrder: 0 }), versionParams)).status).toBe(401);
  });
  it("PATCH /fields/[fieldId]", async () => {
    const { PATCH } = await import("@/app/api/forms/fields/[fieldId]/route");
    expect((await PATCH(jsonReq("PATCH", { label: "F2" }), fieldParams)).status).toBe(401);
  });
  it("DELETE /fields/[fieldId]", async () => {
    const { DELETE } = await import("@/app/api/forms/fields/[fieldId]/route");
    expect((await DELETE(jsonReq("DELETE"), fieldParams)).status).toBe(401);
  });
});

describe("admin builder routes — assertModule gate is wired (denied => 403)", () => {
  it("POST /sets calls assertModule and surfaces 403", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser", email: "u@b.co", name: "U" });
    vi.mocked(assertModule).mockRejectedValue(Object.assign(new Error("Forbidden"), { statusCode: 403 }));
    const { POST } = await import("@/app/api/forms/sets/route");
    const res = await POST(jsonReq("POST", { name: "X" }));
    expect(assertModule).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }), "settings", "edit");
    expect(res.status).toBe(403);
  });
});

describe("agent runtime routes — require auth (but not the settings gate)", () => {
  it("GET /versions/[versionId]/runtime => 401 unauthenticated", async () => {
    const { GET } = await import("@/app/api/forms/versions/[versionId]/runtime/route");
    expect((await GET(jsonReq("GET"), versionParams)).status).toBe(401);
  });
  it("GET /forms/runtime (current live) => 401 unauthenticated", async () => {
    const { GET } = await import("@/app/api/forms/runtime/route");
    expect((await GET(jsonReq("GET"))).status).toBe(401);
  });
});
