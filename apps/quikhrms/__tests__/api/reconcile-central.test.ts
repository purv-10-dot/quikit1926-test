import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * POST /api/v1/hrms/settings/reconcile-central — batch drift detection between
 * HRMS employees and the live central QuikIT membership state, with fix:true
 * applying the safe corrections.
 */

// ── Mocks ────────────────────────────────────────────────────────────────
const memberLookupRemote = vi.fn();
const applyCentralState = vi.fn();
const centralSyncConfigured = vi.fn();
const createAuditLog = vi.fn();
const employeeFindMany = vi.fn();
const employeeUpdateMany = vi.fn();

vi.mock("@quikit/auth/member-lookup-remote", () => ({
  memberLookupRemote: (...a: unknown[]) => memberLookupRemote(...a),
}));
vi.mock("@/lib/rbac/central-sync", () => ({
  applyCentralState: (...a: unknown[]) => applyCentralState(...a),
  centralSyncConfigured: (...a: unknown[]) => centralSyncConfigured(...a),
}));
vi.mock("@/lib/utils/audit", () => ({ createAuditLog: (...a: unknown[]) => createAuditLog(...a) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    employee: {
      findMany: (...a: unknown[]) => employeeFindMany(...a),
      updateMany: (...a: unknown[]) => employeeUpdateMany(...a),
    },
  },
}));
vi.mock("@/lib/with-auth", () => ({
  withAuth:
    (handler: (req: unknown, ctx: unknown, params: unknown) => Promise<unknown>) =>
    async (req: unknown, context: { params: Promise<unknown> }) =>
      handler(
        req,
        { orgId: "tenant-1", userId: "emp-admin", roles: ["admin"], permissions: ["*"], roleCode: "admin", mustChangePassword: false },
        await context.params,
      ),
}));

interface ReconcileResult {
  checked: number;
  driftCount: number;
  fixed: number;
  drift: { employeeId: string; kind: string; fixed: boolean }[];
}
type RouteResponse = { status: number; json: () => Promise<{ success: boolean; data: ReconcileResult }> };
type PostFn = (req: unknown, ctx: { params: Promise<Record<string, string>> }) => Promise<RouteResponse>;

async function loadPost(): Promise<PostFn> {
  const mod = await import("@/app/api/v1/hrms/settings/reconcile-central/route");
  return mod.POST as unknown as PostFn;
}

function makeReq(body: unknown) {
  return { nextUrl: { origin: "http://localhost:3009", pathname: "/api/v1/hrms/settings/reconcile-central" }, method: "POST", json: async () => body };
}
const ctx = { params: Promise.resolve({}) };

const EMPLOYEES = [
  // linked, central role drifted member → org_admin
  { id: "e1", employeeCode: "EMP-1", workEmail: "one@acme.com", authUserId: "u1", status: "Active", centralRole: "member", centralDeactivatedAt: null },
  // linked, access revoked centrally
  { id: "e2", employeeCode: "EMP-2", workEmail: "two@acme.com", authUserId: "u2", status: "Active", centralRole: "member", centralDeactivatedAt: null },
  // unlinked but central knows the email
  { id: "e3", employeeCode: "EMP-3", workEmail: "three@acme.com", authUserId: null, status: "Active", centralRole: null, centralDeactivatedAt: null },
  // linked + healthy → no drift
  { id: "e4", employeeCode: "EMP-4", workEmail: "four@acme.com", authUserId: "u4", status: "Active", centralRole: "member", centralDeactivatedAt: null },
];

const LOOKUP_MEMBERS = [
  { requested: "u1", found: true, userId: "u1", email: "one@acme.com", isSuperAdmin: false, memberStatus: "active", memberRole: "org_admin", hasAppAccess: true },
  { requested: "u2", found: true, userId: "u2", email: "two@acme.com", isSuperAdmin: false, memberStatus: "inactive", memberRole: "member", hasAppAccess: false },
  { requested: "three@acme.com", found: true, userId: "u3", email: "three@acme.com", isSuperAdmin: false, memberStatus: "active", memberRole: "member", hasAppAccess: true },
  { requested: "u4", found: true, userId: "u4", email: "four@acme.com", isSuperAdmin: false, memberStatus: "active", memberRole: "member", hasAppAccess: true },
];

describe("POST /settings/reconcile-central", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    centralSyncConfigured.mockReturnValue(true);
    employeeFindMany.mockResolvedValue(EMPLOYEES);
    memberLookupRemote.mockResolvedValue({ ok: true, members: LOOKUP_MEMBERS });
    applyCentralState.mockResolvedValue(true);
    employeeUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("503s when central sync is not configured", async () => {
    centralSyncConfigured.mockReturnValue(false);
    const POST = await loadPost();
    const res = await POST(makeReq({}), ctx);
    expect(res.status).toBe(503);
  });

  it("reports drift without writing anything by default", async () => {
    const POST = await loadPost();
    const res = await POST(makeReq({}), ctx);
    const { data } = await res.json();

    expect(res.status).toBe(200);
    expect(data.checked).toBe(4);
    expect(data.driftCount).toBe(3);
    expect(data.fixed).toBe(0);

    const kinds = new Map(data.drift.map((d) => [d.employeeId, d.kind]));
    expect(kinds.get("e1")).toBe("central_role_drift");
    expect(kinds.get("e2")).toBe("central_access_revoked");
    expect(kinds.get("e3")).toBe("unlinked_employee");
    expect(kinds.has("e4")).toBe(false);

    expect(applyCentralState).not.toHaveBeenCalled();
    expect(employeeUpdateMany).not.toHaveBeenCalled();
  });

  it("applies safe fixes when fix=true", async () => {
    const POST = await loadPost();
    const res = await POST(makeReq({ fix: true }), ctx);
    const { data } = await res.json();

    expect(data.fixed).toBe(3);
    // Linked drift goes through the shared sync logic.
    expect(applyCentralState).toHaveBeenCalledTimes(2);
    // Unlinked employee gets the identity link backfilled (only when unclaimed).
    expect(employeeUpdateMany).toHaveBeenCalledTimes(1);
    expect(employeeUpdateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "e3", orgId: "tenant-1", authUserId: null },
      data: { authUserId: "u3" },
    });
    expect(data.drift.every((d) => d.fixed)).toBe(true);
  });

  it("propagates a central lookup failure as 503", async () => {
    memberLookupRemote.mockResolvedValue({ ok: false, error: "Network error" });
    const POST = await loadPost();
    const res = await POST(makeReq({}), ctx);
    expect(res.status).toBe(503);
  });
});
