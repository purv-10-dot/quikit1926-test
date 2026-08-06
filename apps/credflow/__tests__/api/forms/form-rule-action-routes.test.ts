/**
 * FR-RE Unit 5 — action route GATING (not exhaustive happy-path). The service
 * layer is covered by form-rule-action.test.ts + the integration suite; here we
 * only prove the action endpoints are not ungated: unauthenticated => 401, and
 * the assertModule("settings","edit") gate is actually wired (denied => 403).
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

const ruleParams = { params: Promise.resolve({ ruleId: "rule_1" }) };
const actionParams = { params: Promise.resolve({ actionId: "act_1" }) };

beforeEach(() => {
  setSession(null);
  vi.mocked(assertModule).mockReset();
  vi.mocked(assertModule).mockResolvedValue(undefined);
});

describe("action routes — unauthenticated => 401", () => {
  it("POST /rules/[ruleId]/actions", async () => {
    const { POST } = await import("@/app/api/forms/rules/[ruleId]/actions/route");
    const res = await POST(
      jsonReq("POST", { actionType: "show_field", targetKind: "field", targetFieldKey: "f", sortOrder: 0 }),
      ruleParams,
    );
    expect(res.status).toBe(401);
  });

  it("PATCH /actions/[actionId]", async () => {
    const { PATCH } = await import("@/app/api/forms/actions/[actionId]/route");
    const res = await PATCH(jsonReq("PATCH", { sortOrder: 1 }), actionParams);
    expect(res.status).toBe(401);
  });

  it("DELETE /actions/[actionId]", async () => {
    const { DELETE } = await import("@/app/api/forms/actions/[actionId]/route");
    const res = await DELETE(jsonReq("DELETE", {}), actionParams);
    expect(res.status).toBe(401);
  });
});

describe("action routes — assertModule gate is wired (denied => 403)", () => {
  it("POST /rules/[ruleId]/actions calls assertModule and surfaces its 403", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser", email: "u@b.co", name: "U" });
    const denied = Object.assign(new Error("Forbidden"), { statusCode: 403 });
    vi.mocked(assertModule).mockRejectedValue(denied);

    const { POST } = await import("@/app/api/forms/rules/[ruleId]/actions/route");
    const res = await POST(
      jsonReq("POST", { actionType: "show_field", targetKind: "field", targetFieldKey: "f", sortOrder: 0 }),
      ruleParams,
    );

    expect(assertModule).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }), "settings", "edit");
    expect(res.status).toBe(403);
  });
});
