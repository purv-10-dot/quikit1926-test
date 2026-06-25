/**
 * Stage 3 — PATCH /api/settings/digest-recipients (RED→GREEN).
 *
 * Admin-gated write that toggles a user into/out of settings.digest.recipientUserIds.
 *
 * Auth: requireApiUser (401) → requirePermission(user, "settings", "edit") (403 for
 * non-admins). Same gate as /api/settings/company PATCH. The 403 case is the lock.
 *
 * Body: { userId, enabled }. The route validates ELIGIBILITY (isDigestEligible) and
 * rejects an ineligible userId with 400 — you cannot toggle on a user the digest
 * could never scope. The actual write is delegated to setDigestRecipient.
 *
 * Seam (mockDb): mocks @/lib/auth/require + @/lib/auth/permissions (assertModule),
 * NOT require-permission — so requirePermission's real admin-bypass/assertModule
 * path runs; drive 403 by making assertModule reject { statusCode: 403 }.
 * isDigestEligible + setDigestRecipient are mocked (route-level test).
 *
 * Route does not exist yet → RED.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

mockDb();

vi.mock("@/lib/services/notifications/digest-eligibility", () => ({
  isDigestEligible: vi.fn(async () => ({ eligible: true })),
}));
vi.mock("@/lib/services/workspace/digest-config", () => ({
  setDigestRecipient: vi.fn(async () => ({ enabled: true, recipientUserIds: ["target"] })),
}));
import { isDigestEligible } from "@/lib/services/notifications/digest-eligibility";
import { setDigestRecipient } from "@/lib/services/workspace/digest-config";

const ROUTE = "@/app/api/settings/digest-recipients/route";

function patchReq(body: unknown) {
  return new Request("http://test/api/settings/digest-recipients", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  setSession(null);
  vi.mocked(assertModule).mockReset();
  vi.mocked(assertModule).mockResolvedValue(undefined);
  vi.mocked(isDigestEligible).mockReset();
  vi.mocked(isDigestEligible).mockResolvedValue({ eligible: true } as never);
  vi.mocked(setDigestRecipient).mockReset();
  vi.mocked(setDigestRecipient).mockResolvedValue({ enabled: true, recipientUserIds: ["target"] } as never);
});

describe("PATCH /api/settings/digest-recipients (admin-gated)", () => {
  it("401 when unauthenticated", async () => {
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ userId: "target", enabled: true }));
    expect(res.status).toBe(401);
  });

  it("403 for an authenticated non-admin WITHOUT settings:edit (the gate lock)", async () => {
    setSession({ userId: "u2", orgId: "t1", role: "SalesUser", email: "r@x.co", name: "R" });
    vi.mocked(assertModule).mockRejectedValue(Object.assign(new Error("Forbidden"), { statusCode: 403 }));
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ userId: "target", enabled: true }));
    expect(res.status).toBe(403);
    expect(setDigestRecipient).not.toHaveBeenCalled();
  });

  it("400 when toggling ON an INELIGIBLE user (cannot scope them)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator", email: "a@x.co", name: "A" });
    vi.mocked(isDigestEligible).mockResolvedValue({ eligible: false, reason: "not-eligible-role" } as never);
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ userId: "target", enabled: true }));
    expect(res.status).toBe(400);
    expect(setDigestRecipient).not.toHaveBeenCalled();
  });

  it("400 on a malformed body (missing userId / enabled)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator", email: "a@x.co", name: "A" });
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ enabled: true })); // no userId
    expect(res.status).toBe(400);
  });

  it("admin toggling ON an eligible user → setDigestRecipient(orgId, userId, true), { success, data }", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator", email: "a@x.co", name: "A" });
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ userId: "target", enabled: true }));
    expect(res.status).toBe(200);
    expect(setDigestRecipient).toHaveBeenCalledWith("t1", "target", true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
  });

  it("toggling OFF does NOT require eligibility (always allowed to remove)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "Administrator", email: "a@x.co", name: "A" });
    // even if somehow ineligible now, removing must be permitted (cleanup path)
    vi.mocked(isDigestEligible).mockResolvedValue({ eligible: false, reason: "no-team" } as never);
    const { PATCH } = await import(ROUTE);
    const res = await PATCH(patchReq({ userId: "target", enabled: false }));
    expect(res.status).toBe(200);
    expect(setDigestRecipient).toHaveBeenCalledWith("t1", "target", false);
  });
});
