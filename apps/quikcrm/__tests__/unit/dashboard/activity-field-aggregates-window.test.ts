/**
 * (i) bundle — RED (B, unit-level): optional range window on
 * getActivityFieldAggregates' $queryRaw.
 *
 * KEYSTONE: range OMITTED → the raw WHERE is unchanged (NO occurredAt clause) so
 * FR-4.3's existing mock-level tests stay green UNTOUCHED. range PASSED → a
 * PARAMETERIZED occurredAt lower+upper bound is added to the WHERE (values fed as
 * params, never concatenated — SQL-injection guard, mirrors buildScopeSql).
 *
 * MOCK-LEVEL LIMIT (honest, same as FR-4.3): this asserts the windowed SQL
 * contains the occurredAt bounds as FILTERS and the bound VALUES are passed as
 * params. It CANNOT prove the windowed query scopes+filters correctly at runtime
 * — that is the separate seed-direct real-DB 2×2 exclusion gate (C).
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
  const call = rawMock.mock.calls[rawMock.mock.calls.length - 1];
  const sqlObj = call[0] as { strings?: string[]; sql?: string; text?: string; values?: unknown[] };
  const sql = sqlObj.strings ? sqlObj.strings.join("?") : sqlObj.sql ?? sqlObj.text ?? "";
  return { sql: sql.replace(/\s+/g, " "), values: sqlObj.values ?? [] };
}

const RANGE = { from: new Date("2026-06-23T00:00:00Z"), to: new Date("2026-06-24T00:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActivityTypeWithFields).mockResolvedValue({
    id: "at1", code: "upwork", label: "Upwork", category: null, config: null, sortOrder: 0, isActive: true,
    fieldDefinitions: [
      { id: "fd_bid", activityTypeId: "at1", key: "bid", label: "Bid", fieldType: "Number", requirement: "Optional", options: null, visible: true, sortOrder: 0 },
    ],
  } as never);
  vi.mocked(getScope).mockResolvedValue({ unrestricted: true } as never);
  vi.mocked(resolveManagerTeam).mockResolvedValue(null as never);
  rawMock.mockResolvedValue([]);
});

describe("(i) — getActivityFieldAggregates optional range window", () => {
  it("range OMITTED → raw WHERE has NO occurredAt clause (FR-4.3 stays green)", async () => {
    await getActivityFieldAggregates(user("Administrator"), { activityTypeId: "at1" });
    const { sql } = lastRawSqlAndValues();
    expect(sql).not.toMatch(/occurredAt/i);
  });

  it("range PASSED → parameterized occurredAt lower+upper bounds in the WHERE", async () => {
    await getActivityFieldAggregates(user("Administrator"), { activityTypeId: "at1", range: RANGE });
    const { sql, values } = lastRawSqlAndValues();
    // occurredAt appears as a bounded filter (>= and <), parameterized (= ?)
    expect(sql).toMatch(/"occurredAt"\s*>=\s*\?/i);
    expect(sql).toMatch(/"occurredAt"\s*<\s*\?/i);
    // the bound VALUES are passed as params (not concatenated)
    expect(values).toContainEqual(RANGE.from);
    expect(values).toContainEqual(RANGE.to);
  });

  it("range PASSED → scope filters still present (window is ADDITIVE, not a replacement)", async () => {
    await getActivityFieldAggregates(user("Administrator"), { activityTypeId: "at1", range: RANGE });
    const { sql } = lastRawSqlAndValues();
    expect(sql).toMatch(/"orgId"\s*=\s*\?/i); // tenant filter still there
    expect(sql).toMatch(/"fieldKey"\s*=\s*ANY/i); // field filter still there
  });
});
