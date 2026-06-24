/**
 * FR-4.3 — per-rep activity custom-field aggregation (the CrmActivityFieldValue
 * payoff). REAL RED→GREEN: getActivityFieldAggregates does not exist yet.
 *
 * Aggregates typed values per rep, tier-scoped, via a $queryRaw join
 * (CrmActivityFieldValue ⨝ CrmActivity on activityId). Because the raw join
 * bypasses Prisma's relation-filter, the org + tier scope MUST be written into
 * the raw WHERE.
 *
 * MOCK-LEVEL LIMIT (honest): $queryRaw is a tagged template; this test asserts
 * the interpolated SQL contains the scope as FILTERS (WHERE … "orgId" = ? AND
 * "ownerId" = ANY(?)) and the scope VALUES are passed as params. It CANNOT prove
 * the SQL executes/scopes correctly — that is what the c-3-style real-DB gate
 * verifies next, by EXCLUSION (an out-of-scope rep must NOT appear).
 *
 * FLAGS: SalesManager person-scoping code-verified/runtime-OWED; by-label type
 * grouping (FR-4.2); count-vs-drill-down asymmetry.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";

vi.mock("@/lib/auth/account-acl", () => ({ getScope: vi.fn() }));
vi.mock("@/lib/services/dashboard/team", () => ({ resolveManagerTeam: vi.fn() }));
vi.mock("@/lib/services/activity-types/repo", () => ({
  listActivityTypes: vi.fn(),
  getActivityTypeWithFields: vi.fn(),
}));

import { getScope } from "@/lib/auth/account-acl";
import { resolveManagerTeam } from "@/lib/services/dashboard/team";
import { getActivityTypeWithFields } from "@/lib/services/activity-types/repo";
import { getActivityFieldAggregates } from "@/lib/services/dashboard/activity-field-aggregates";

function user(role: string) {
  return { userId: "u1", orgId: "t1", role, email: "u@x.co", name: "U" } as never;
}

const rawMock = prismaMock.$queryRaw as unknown as {
  mockResolvedValue: (v: unknown) => void;
  mock: { calls: unknown[][] };
};

function lastRawSqlAndValues() {
  // prisma.$queryRaw(Prisma.sql`...`) passes ONE arg: a Prisma.Sql object with
  // .strings (the template chunks) + .values (the interpolated params). We
  // reconstruct the SQL with `?` where each param interpolates, and read values.
  const call = rawMock.mock.calls[rawMock.mock.calls.length - 1];
  const sqlObj = call[0] as { strings?: string[]; sql?: string; text?: string; values?: unknown[] };
  const sql = sqlObj.strings ? sqlObj.strings.join("?") : sqlObj.sql ?? sqlObj.text ?? "";
  return { sql, values: sqlObj.values ?? [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActivityTypeWithFields).mockResolvedValue({
    id: "at1", code: "upwork", label: "Upwork", category: null, config: null, sortOrder: 0, isActive: true,
    fieldDefinitions: [
      { id: "fd_bid", activityTypeId: "at1", key: "bid", label: "Bid", fieldType: "Number", requirement: "Optional", options: null, visible: true, sortOrder: 0 },
      { id: "fd_out", activityTypeId: "at1", key: "outcome", label: "Outcome", fieldType: "Select", requirement: "Optional", options: ["Replied", "No reply"], visible: true, sortOrder: 1 },
    ],
  } as never);
  rawMock.mockResolvedValue([]);
});

describe("FR-4.3 — getActivityFieldAggregates (per-rep, tier-scoped, raw join)", () => {
  it("SalesManager → scope appears as FILTERS in WHERE (orgId = ?, ownerId = ANY(member set))", async () => {
    vi.mocked(getScope).mockResolvedValue({ unrestricted: false, allowedAccountIds: ["acc1"], teamMemberIds: [] } as never);
    vi.mocked(resolveManagerTeam).mockResolvedValue({ memberIds: ["m1", "m2"], memberNames: [], size: 2 } as never);

    await getActivityFieldAggregates(user("SalesManager"), { activityTypeId: "at1" });

    const { sql, values } = lastRawSqlAndValues();
    const flat = sql.replace(/\s+/g, " ");

    expect(flat).toMatch(/CrmActivityFieldValue/i);
    expect(flat).toMatch(/CrmActivity\b/i);
    // TIGHTENED: scope as FILTERS, not just words present.
    expect(flat).toMatch(/\bWHERE\b/i);
    expect(flat).toMatch(/"orgId"\s*=\s*\?/i);                 // orgId equality filter
    expect(flat).toMatch(/"ownerId"\s*=\s*ANY\(\s*\?/i);       // ownerId restricted to member set
    expect(values).toContainEqual(["m1", "m2"]);               // the member set feeds it
    expect(flat).toMatch(/GROUP BY[^?]*"ownerId"/i);           // grouped per owner
  });

  it("SalesUser → scope filters to ownerId = self (degenerate per-rep)", async () => {
    vi.mocked(getScope).mockResolvedValue({ unrestricted: false, allowedAccountIds: [], teamMemberIds: [] } as never);
    vi.mocked(resolveManagerTeam).mockResolvedValue(null as never);

    await getActivityFieldAggregates(user("SalesUser"), { activityTypeId: "at1" });

    const { sql, values } = lastRawSqlAndValues();
    const flat = sql.replace(/\s+/g, " ");
    expect(flat).toMatch(/"orgId"\s*=\s*\?/i);
    // self-scope: ownerId = ? (a single self id), as a filter
    expect(flat).toMatch(/"ownerId"\s*=\s*\?/i);
    expect(values).toContain("u1"); // self ownerId param
    expect(values).toContain("t1"); // orgId param
  });

  it("Administrator → org-scoped filter (orgId = ?), no owner restriction", async () => {
    vi.mocked(getScope).mockResolvedValue({ unrestricted: true } as never);
    vi.mocked(resolveManagerTeam).mockResolvedValue(null as never);

    await getActivityFieldAggregates(user("Administrator"), { activityTypeId: "at1" });

    const { sql, values } = lastRawSqlAndValues();
    const flat = sql.replace(/\s+/g, " ");
    expect(flat).toMatch(/"orgId"\s*=\s*\?/i); // tenant filter always present
    expect(values).toContain("t1");
  });

  it("maps raw rows into per-rep aggregates (numberSum for Number, countsByValue for Select, teamTotal rollup)", async () => {
    vi.mocked(getScope).mockResolvedValue({ unrestricted: true } as never);
    rawMock.mockResolvedValue([
      { ownerId: "m1", ownerName: "Rep One", fieldKey: "bid", numberSum: 3000, valueText: null, valueCount: null },
      { ownerId: "m2", ownerName: "Rep Two", fieldKey: "bid", numberSum: 1500, valueText: null, valueCount: null },
      { ownerId: "m1", ownerName: "Rep One", fieldKey: "outcome", numberSum: null, valueText: "Replied", valueCount: 2 },
    ]);

    const res = await getActivityFieldAggregates(user("Administrator"), { activityTypeId: "at1" });

    const bid = res.find((f) => f.fieldKey === "bid");
    expect(bid?.fieldLabel).toBe("Bid");
    expect(bid?.perRep).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerId: "m1", ownerName: "Rep One", numberSum: 3000 }),
        expect.objectContaining({ ownerId: "m2", ownerName: "Rep Two", numberSum: 1500 }),
      ]),
    );
    expect(bid?.teamTotal?.numberSum).toBe(4500); // top-line rollup across reps

    const outcome = res.find((f) => f.fieldKey === "outcome");
    expect(outcome?.perRep.find((r) => r.ownerId === "m1")?.countsByValue).toEqual([
      { value: "Replied", count: 2 },
    ]);
  });
});
