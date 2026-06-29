/**
 * T-P3.1 — RED-first for the user-facing activity-types list endpoint used by
 * the logging UX: GET /api/activities/types.
 *
 * Distinct from the ADMIN config list (/api/settings/activity-types, which is
 * requirePermission("settings")-gated). Loggers need to read active types
 * WITHOUT settings perms — so this endpoint gates on activities:view.
 *
 * Empty-types behavior is LOCKED (decision: empty-state CTA, not seed-type
 * fallback): the endpoint returns ONLY real, isActive, admin-configured types.
 * It NEVER synthesizes built-in Note/Call/Email options. An empty org yields
 * { success: true, data: [] } — a valid response, not an error.
 *
 * Written BEFORE the route exists → RED for one reason: the module doesn't
 * resolve. Assertions:
 *  (a) inverse-lock: a non-settings user with activities:view CAN list
 *      (proves NOT settings-gated);
 *  (b) org-scoped (query carries the session orgId);
 *  (c) isActive-only (inactive types excluded);
 *  (d) empty list is a valid { success: true, data: [] } response.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

const db = mockDb();

const ROUTE = "@/app/api/activities/types/route";

function salesUserSession() {
  // A plain logger — NOT an admin, NO settings perms.
  setSession({ userId: "u2", orgId: "t1", role: "SalesUser", email: "rep@x.co", name: "Rep" });
}

beforeEach(() => {
  setSession(null);
  vi.mocked(assertModule).mockReset();
  vi.mocked(assertModule).mockResolvedValue(undefined);
  db.crmActivityType.findMany.mockReset();
});

describe("GET /api/activities/types (user-facing list for logging)", () => {
  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import(ROUTE);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("INVERSE-LOCK: a user who would FAIL a settings check still gets 200 (gated on activities, not settings)", async () => {
    salesUserSession();
    db.crmActivityType.findMany.mockResolvedValue([
      { id: "at1", code: "upwork_connect", label: "Upwork Connect", isActive: true, sortOrder: 0 },
    ] as never);

    // Real requirePermission runs (mockDb does not mock it) and calls the
    // MOCKED assertModule. Simulate a genuine non-settings logger: a
    // settings:edit/view check would FAIL, but activities:view passes. If the
    // route ever copied requirePermission(user,"settings") in, this rejects →
    // the test fails. That's what makes the inverse-lock real, not just
    // "activities gate was called".
    vi.mocked(assertModule).mockImplementation(async (_user, module: string) => {
      if (module === "settings") {
        throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
      }
      return undefined;
    });

    const { GET } = await import(ROUTE);
    const res = await GET();

    expect(res.status).toBe(200); // NOT 403 — proves no settings gate
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data[0]?.code).toBe("upwork_connect");
    // Positive: the activities gate WAS used; negative: settings was NOT.
    expect(vi.mocked(assertModule)).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "t1" }),
      "activities",
      "view",
    );
    expect(vi.mocked(assertModule)).not.toHaveBeenCalledWith(
      expect.anything(),
      "settings",
      expect.anything(),
    );
  });

  it("scopes the query to the session orgId", async () => {
    salesUserSession();
    db.crmActivityType.findMany.mockResolvedValue([] as never);

    const { GET } = await import(ROUTE);
    await GET();

    const arg = db.crmActivityType.findMany.mock.calls[0]?.[0] as { where: { orgId?: string } };
    expect(arg.where.orgId).toBe("t1");
  });

  it("returns only isActive types (inactive excluded)", async () => {
    salesUserSession();
    db.crmActivityType.findMany.mockResolvedValue([] as never);

    const { GET } = await import(ROUTE);
    await GET();

    const arg = db.crmActivityType.findMany.mock.calls[0]?.[0] as { where: { isActive?: boolean } };
    expect(arg.where.isActive).toBe(true);
  });

  it("empty org → valid { success: true, data: [] } (empty-state, NOT an error, NOT synthesized built-ins)", async () => {
    salesUserSession();
    db.crmActivityType.findMany.mockResolvedValue([] as never);

    const { GET } = await import(ROUTE);
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]); // no synthesized Note/Call/Email fallback
  });
});
