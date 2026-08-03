/**
 * GET /api/users/picker — must return only ACTIVE org members who are QuikCRM
 * users (a `quikit.UserAppAccess` row on the QuikCRM appId).
 *
 * Regression: the Settings → Activity Targets "Assign Targets" table sourced its
 * salesperson list from this route, which returned every active org member —
 * including people who only use other QuikIT modules (QuikScale, QuikHRMS, …)
 * and can never log a CRM activity.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { prismaMock, resetPrismaUnitMocks } from "../../helpers/prisma-unit-mock";

vi.mock("@/lib/api/quikcrm-app", () => ({
  getQuikCrmAppId: vi.fn(async () => "app_quikcrm_id"),
  QUIKCRM_APP_SLUG: "quikcrm",
  ensureQuikCrmAppAccess: vi.fn(),
}));
import { getQuikCrmAppId } from "@/lib/api/quikcrm-app";

const requireApiUser = vi.fn();
vi.mock("@/lib/auth/require", () => ({
  requireApiUser: (...a: unknown[]) => requireApiUser(...a),
  isResponse: (v: unknown) => v instanceof Response,
  errorResponse: (e: unknown) =>
    Response.json({ success: false, error: (e as Error)?.message ?? "err" }, { status: 500 }),
}));

const ROUTE = "@/app/api/users/picker/route";
const ORG = "org1";
const CRM_APP_ID = "app_quikcrm_id";

type Member = { userId: string; role: string };

function setMembers(rows: Member[]) {
  (prismaMock.orgMember.findMany as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
    rows.map((r) => ({
      userId: r.userId,
      role: r.role,
      user: {
        id: r.userId,
        firstName: r.userId.toUpperCase(),
        lastName: "User",
        email: `${r.userId}@x.co`,
      },
    })),
  );
}

function setAppAccess(userIds: string[]) {
  (prismaMock.userAppAccess.findMany as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
    userIds.map((userId) => ({ userId })),
  );
}

beforeEach(() => {
  resetPrismaUnitMocks();
  requireApiUser.mockReset();
  vi.mocked(getQuikCrmAppId).mockResolvedValue(CRM_APP_ID);
  requireApiUser.mockResolvedValue({ id: "admin", orgId: ORG, role: "Administrator" });
});

async function call() {
  const { GET } = await import(ROUTE);
  return GET();
}

describe("GET /api/users/picker", () => {
  it("401 when unauthenticated", async () => {
    requireApiUser.mockResolvedValue(
      Response.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    );
    expect((await call()).status).toBe(401);
  });

  it("excludes active org members without QuikCRM app access", async () => {
    setMembers([
      { userId: "crm1", role: "SalesUser" },
      { userId: "scale1", role: "member" },
      { userId: "crm2", role: "SalesManager" },
    ]);
    setAppAccess(["crm1", "crm2"]);

    const body = await (await call()).json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["crm1", "crm2"]);
  });

  it("scopes the UserAppAccess lookup to the org AND the QuikCRM appId", async () => {
    setMembers([{ userId: "crm1", role: "SalesUser" }]);
    setAppAccess(["crm1"]);
    await call();

    const calls = (
      prismaMock.userAppAccess.findMany as unknown as {
        mock: { calls: { 0: { where?: { orgId?: string; appId?: string } } }[] };
      }
    ).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c[0]?.where?.orgId).toBe(ORG);
      expect(c[0]?.where?.appId).toBe(CRM_APP_ID);
    }
  });

  it("returns an empty list when nobody in the org has QuikCRM access", async () => {
    setMembers([{ userId: "scale1", role: "member" }]);
    setAppAccess([]);
    const body = await (await call()).json();
    expect(body.items).toEqual([]);
  });

  it("only lists ACTIVE memberships", async () => {
    setMembers([{ userId: "crm1", role: "SalesUser" }]);
    setAppAccess(["crm1"]);
    await call();

    const where = (
      prismaMock.orgMember.findMany as unknown as { mock: { calls: { 0: { where?: Record<string, unknown> } }[] } }
    ).mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ orgId: ORG, status: "active" });
  });

  it("falls back to all active members when the QuikCRM App row is not registered", async () => {
    vi.mocked(getQuikCrmAppId).mockResolvedValue(null);
    setMembers([
      { userId: "crm1", role: "SalesUser" },
      { userId: "scale1", role: "member" },
    ]);
    const body = await (await call()).json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["crm1", "scale1"]);
    expect(prismaMock.userAppAccess.findMany).not.toHaveBeenCalled();
  });
});
