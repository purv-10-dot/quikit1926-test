/**
 * T-P3.3a — RED-first for the user-facing per-type fields endpoint the logging
 * type-picker calls once a type is chosen: GET /api/activities/types/[id]/fields.
 *
 * Distinct from the ADMIN field-list (/api/settings/activity-types/[id]/fields,
 * requirePermission("settings")-gated). A logger needs a type's field defs
 * WITHOUT settings perms — so this gates on activities:view (same inverse-lock
 * as the T-P3.1 list endpoint). Returns fieldDefs[] only (the picker already
 * has the type from the list; it just needs the fields now).
 *
 * Written BEFORE the route exists → RED for one reason: the module doesn't
 * resolve. Assertions:
 *  (a) 401 unauth;
 *  (b) inverse-lock: a user who would FAIL a settings check still gets 200
 *      (gated on activities, not settings);
 *  (c) org-scoped: a type not in the caller's org → 404 (cross-tenant);
 *  (d) returns the type's field definitions.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

// Control the repo's per-type read (the route is expected to reuse it).
vi.mock("@/lib/services/activity-types/repo", () => ({
  getActivityTypeWithFields: vi.fn(),
}));
import { getActivityTypeWithFields } from "@/lib/services/activity-types/repo";

// Call for its side effect: mockDb() hoists the @/lib/auth + Prisma mocks the
// route depends on (session/401). This test controls the repo via vi.mock
// above, so it doesn't need the returned db handle.
mockDb();

const ROUTE = "@/app/api/activities/types/[id]/fields/route";
const TYPE_ID = "at1";

function params() {
  return { params: Promise.resolve({ id: TYPE_ID }) };
}

function salesUserSession() {
  setSession({ userId: "u2", orgId: "t1", role: "SalesUser", email: "rep@x.co", name: "Rep" });
}

function typeWithFields() {
  return {
    id: TYPE_ID,
    code: "upwork_connect",
    label: "Upwork Connect",
    category: null,
    config: null,
    sortOrder: 0,
    isActive: true,
    fieldDefinitions: [
      { id: "fd_bid", activityTypeId: TYPE_ID, key: "bid", label: "Bid", fieldType: "Number", requirement: "Required", options: null, visible: true, sortOrder: 0 },
    ],
  };
}

beforeEach(() => {
  setSession(null);
  vi.mocked(assertModule).mockReset();
  vi.mocked(assertModule).mockResolvedValue(undefined);
  vi.mocked(getActivityTypeWithFields).mockReset();
});

describe("GET /api/activities/types/[id]/fields (user-facing per-type fields)", () => {
  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import(ROUTE);
    const res = await GET(new Request("http://test") as unknown as import("next/server").NextRequest, params());
    expect(res.status).toBe(401);
  });

  it("INVERSE-LOCK: a user who would FAIL a settings check still gets 200 (gated on activities, not settings)", async () => {
    salesUserSession();
    vi.mocked(assertModule).mockImplementation(async (_user, module: string) => {
      if (module === "settings") throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
      return undefined;
    });
    vi.mocked(getActivityTypeWithFields).mockResolvedValue(typeWithFields() as never);

    const { GET } = await import(ROUTE);
    const res = await GET(new Request("http://test") as unknown as import("next/server").NextRequest, params());

    expect(res.status).toBe(200); // NOT 403 — proves no settings gate
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

  it("returns the type's field definitions", async () => {
    salesUserSession();
    vi.mocked(getActivityTypeWithFields).mockResolvedValue(typeWithFields() as never);

    const { GET } = await import(ROUTE);
    const res = await GET(new Request("http://test") as unknown as import("next/server").NextRequest, params());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.key).toBe("bid");
    // the repo read was scoped to (orgId, typeId)
    expect(getActivityTypeWithFields).toHaveBeenCalledWith("t1", TYPE_ID);
  });

  it("returns 404 when the type is not in the caller's org (cross-tenant)", async () => {
    salesUserSession();
    // getActivityTypeWithFields is scoped to (orgId, id) → null for a foreign type.
    vi.mocked(getActivityTypeWithFields).mockResolvedValue(null as never);

    const { GET } = await import(ROUTE);
    const res = await GET(new Request("http://test") as unknown as import("next/server").NextRequest, params());

    expect(res.status).toBe(404);
  });
});
