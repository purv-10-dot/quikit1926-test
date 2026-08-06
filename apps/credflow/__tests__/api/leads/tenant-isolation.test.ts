/**
 * Cross-tenant isolation test for the lead read paths (launch item 9).
 *
 * Every other API test mocks the DB with mockDeep<PrismaClient>(), whose
 * findMany/count return armed data regardless of the `where` — so a route that
 * forgets its `tenantId` filter still goes green. This test instead drives the
 * real route handlers through a FAITHFUL in-memory fake whose findMany/count
 * actually honor the tenant constraint: if a route ever drops the tenantId
 * filter, the fake returns the other tenant's rows and these assertions fail.
 *
 * Covered: GET /api/leads and POST /api/leads/filter. The dashboard read path is
 * covered separately by __tests__/api/dashboard/middleware-integration.test.ts.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";

type LeadRow = {
  id: string;
  tenantId: string;
  name: string;
  deletedAt: Date | null;
  [k: string]: unknown;
};

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

const seed: LeadRow[] = [
  { id: "a1", tenantId: TENANT_A, name: "A One", deletedAt: null },
  { id: "a2", tenantId: TENANT_A, name: "A Two", deletedAt: null },
  { id: "b1", tenantId: TENANT_B, name: "B One", deletedAt: null },
];

/**
 * Pull the tenantId constraint out of a Prisma `where`. Handles both the
 * top-level `{ tenantId }` (list route) and `{ AND: [{ tenantId }, ...] }`
 * (filter route) shapes. Returns undefined when NO tenant constraint exists —
 * which is exactly the leak we want the fake to surface (it then returns every
 * tenant's rows, failing the isolation assertions).
 */
function extractTenantId(where: unknown): string | undefined {
  if (!where || typeof where !== "object") return undefined;
  const w = where as Record<string, unknown>;
  if (typeof w.tenantId === "string") return w.tenantId;
  if (Array.isArray(w.AND)) {
    for (const clause of w.AND) {
      const t = extractTenantId(clause);
      if (t) return t;
    }
  }
  return undefined;
}

function selectRows(where: unknown): LeadRow[] {
  const tenantId = extractTenantId(where);
  const active = seed.filter((r) => r.deletedAt === null);
  return tenantId ? active.filter((r) => r.tenantId === tenantId) : active;
}

const fakePrisma = {
  crmLead: {
    findMany: vi.fn(async (args: { where?: unknown; skip?: number; take?: number }) => {
      const rows = selectRows(args?.where);
      const skip = args?.skip ?? 0;
      const take = args?.take ?? rows.length;
      return rows.slice(skip, skip + take);
    }),
    count: vi.fn(async (args: { where?: unknown }) => selectRows(args?.where).length),
  },
};

vi.mock("@quikit/database", () => ({ db: fakePrisma }));
vi.mock("@/lib/db", () => ({ db: fakePrisma }));
vi.mock("@/lib/db/prisma", () => ({ prisma: fakePrisma }));

const sessionRef: { current: { userId: string; tenantId: string; role: string } | null } = {
  current: null,
};

vi.mock("@/lib/auth/require", () => ({
  requireApiUser: vi.fn(async () => {
    const s = sessionRef.current;
    if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return { ...s, email: "u@example.com", name: "Test" };
  }),
  isResponse: (x: unknown): x is Response => x instanceof Response,
  errorResponse: (e: unknown) => {
    const m = e instanceof Error ? e.message : "err";
    return NextResponse.json({ error: m }, { status: 500 });
  },
}));
vi.mock("@/lib/auth/permissions", () => ({
  assertModule: vi.fn().mockResolvedValue(undefined),
  maskHiddenLeadFields: vi.fn(async (_u: unknown, r: unknown) => r),
  filterRestrictedLeadFields: vi.fn(async (_u: unknown, p: unknown) => p),
}));
vi.mock("@/lib/auth/account-acl", () => ({
  accountScopeFilter: vi.fn().mockResolvedValue(null),
  assertAccountAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/fields/repo", () => ({
  listLeadFields: vi.fn(async () => []),
  listCustomFields: vi.fn(async () => []),
}));

function asTenant(tenantId: string): void {
  sessionRef.current = { userId: `u-${tenantId}`, tenantId, role: "SalesUser" };
}

async function callListLeads(): Promise<Response> {
  const { GET } = await import("@/app/api/leads/route");
  const req = new Request("http://test/api/leads?page=1&pageSize=25");
  return GET(req as unknown as import("next/server").NextRequest);
}

async function callFilterLeads(): Promise<Response> {
  const { POST } = await import("@/app/api/leads/filter/route");
  const req = new Request("http://test/api/leads/filter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filter: { matchMode: "ALL", conditions: [] }, page: 1, pageSize: 25 }),
  });
  return POST(req as unknown as import("next/server").NextRequest);
}

describe("cross-tenant isolation — lead read paths", () => {
  beforeEach(() => {
    fakePrisma.crmLead.findMany.mockClear();
    fakePrisma.crmLead.count.mockClear();
    sessionRef.current = null;
  });

  it("GET /api/leads returns only the caller's tenant rows", async () => {
    asTenant(TENANT_A);
    const resA = await callListLeads();
    expect(resA.status).toBe(200);
    const jsonA = await resA.json();
    expect(jsonA.items.map((l: LeadRow) => l.id).sort()).toEqual(["a1", "a2"]);
    expect(jsonA.total).toBe(2);
    expect(jsonA.items.some((l: LeadRow) => l.tenantId === TENANT_B)).toBe(false);

    asTenant(TENANT_B);
    const resB = await callListLeads();
    const jsonB = await resB.json();
    expect(jsonB.items.map((l: LeadRow) => l.id)).toEqual(["b1"]);
    expect(jsonB.total).toBe(1);
  });

  it("POST /api/leads/filter returns only the caller's tenant rows", async () => {
    asTenant(TENANT_A);
    const resA = await callFilterLeads();
    expect(resA.status).toBe(200);
    const jsonA = await resA.json();
    expect(jsonA.items.map((l: LeadRow) => l.id).sort()).toEqual(["a1", "a2"]);
    expect(jsonA.total).toBe(2);

    asTenant(TENANT_B);
    const resB = await callFilterLeads();
    const jsonB = await resB.json();
    expect(jsonB.items.map((l: LeadRow) => l.id)).toEqual(["b1"]);
    expect(jsonB.total).toBe(1);
  });

  it("every fake query carried a tenantId constraint (no unscoped read slipped through)", async () => {
    asTenant(TENANT_A);
    await callListLeads();
    await callFilterLeads();

    const allCalls = [
      ...fakePrisma.crmLead.findMany.mock.calls,
      ...fakePrisma.crmLead.count.mock.calls,
    ];
    expect(allCalls.length).toBeGreaterThan(0);
    for (const [args] of allCalls) {
      expect(extractTenantId((args as { where?: unknown })?.where)).toBe(TENANT_A);
    }
  });
});
