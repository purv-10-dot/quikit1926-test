/**
 * FR-RE Unit 4 — route GATING (not exhaustive happy-path). The service layer is
 * covered by form-rule.test.ts + the integration suite; here we only prove the
 * 6 rule/condition endpoints are not ungated: unauthenticated => 401, and the
 * assertModule("settings","edit") gate is actually wired (a denied gate => 403).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

mockDb();

function jsonReq(method: string, body: unknown) {
  return new Request("http://test/api/forms", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const versionParams = { params: Promise.resolve({ versionId: "ver_1" }) };
const ruleParams = { params: Promise.resolve({ ruleId: "rule_1" }) };
const condParams = { params: Promise.resolve({ conditionId: "cond_1" }) };

beforeEach(() => {
  setSession(null);
  vi.mocked(assertModule).mockReset();
  vi.mocked(assertModule).mockResolvedValue(undefined);
});

describe("rule/condition routes — unauthenticated => 401", () => {
  it("POST /versions/[versionId]/rules", async () => {
    const { POST } = await import("@/app/api/forms/versions/[versionId]/rules/route");
    const res = await POST(jsonReq("POST", { name: "r", matchType: "all", sortOrder: 0 }), versionParams);
    expect(res.status).toBe(401);
  });

  it("PATCH /rules/[ruleId]", async () => {
    const { PATCH } = await import("@/app/api/forms/rules/[ruleId]/route");
    const res = await PATCH(jsonReq("PATCH", { name: "r2" }), ruleParams);
    expect(res.status).toBe(401);
  });

  it("DELETE /rules/[ruleId]", async () => {
    const { DELETE } = await import("@/app/api/forms/rules/[ruleId]/route");
    const res = await DELETE(jsonReq("DELETE", {}), ruleParams);
    expect(res.status).toBe(401);
  });

  it("POST /rules/[ruleId]/conditions", async () => {
    const { POST } = await import("@/app/api/forms/rules/[ruleId]/conditions/route");
    const res = await POST(jsonReq("POST", { subjectKind: "status", operator: "is", valueKeys: ["x"], sortOrder: 0 }), ruleParams);
    expect(res.status).toBe(401);
  });

  it("PATCH /conditions/[conditionId]", async () => {
    const { PATCH } = await import("@/app/api/forms/conditions/[conditionId]/route");
    const res = await PATCH(jsonReq("PATCH", { sortOrder: 1 }), condParams);
    expect(res.status).toBe(401);
  });

  it("DELETE /conditions/[conditionId]", async () => {
    const { DELETE } = await import("@/app/api/forms/conditions/[conditionId]/route");
    const res = await DELETE(jsonReq("DELETE", {}), condParams);
    expect(res.status).toBe(401);
  });
});

describe("rule/condition routes — assertModule gate is wired (denied => 403)", () => {
  it("POST /versions/[versionId]/rules calls assertModule and surfaces its 403", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser", email: "u@b.co", name: "U" });
    const denied = Object.assign(new Error("Forbidden"), { statusCode: 403 });
    vi.mocked(assertModule).mockRejectedValue(denied);

    const { POST } = await import("@/app/api/forms/versions/[versionId]/rules/route");
    const res = await POST(jsonReq("POST", { name: "r", matchType: "all", sortOrder: 0 }), versionParams);

    expect(assertModule).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }), "settings", "edit");
    expect(res.status).toBe(403);
  });
});
