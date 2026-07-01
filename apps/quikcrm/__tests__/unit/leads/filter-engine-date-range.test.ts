/**
 * Date-range filtering for the Leads "Created within" quick filter.
 *
 * The toolbar emits a single `createdAt` / `between` condition with `value`
 * (From) and `valueTo` (To). The engine must:
 *   - produce an inclusive [start-of-from-day, end-of-to-day] range,
 *   - support one open bound (From-only or To-only),
 *   - normalize swapped bounds,
 *   - drop the condition when both bounds are empty,
 *   - AND-compose with other conditions (search / filters).
 */
import { describe, expect, it } from "vitest";
import { translateFilterToPrismaWhere } from "@/lib/services/leads/filter-engine";

function createdAtBetween(value: string | null, valueTo: string | null) {
  return translateFilterToPrismaWhere({
    matchMode: "ALL",
    conditions: [{ field: "createdAt", operator: "between", value, valueTo }],
  });
}

describe("lead filter — createdAt date range", () => {
  it("builds an inclusive gte/lte range when both bounds are set", () => {
    const where = createdAtBetween("2026-06-01", "2026-06-30") as {
      createdAt: { gte: Date; lte: Date };
    };
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(where.createdAt.lte).toBeInstanceOf(Date);
    // From is start-of-day, To is end-of-day → the full To day is included.
    expect(where.createdAt.gte.getHours()).toBe(0);
    expect(where.createdAt.gte.getMinutes()).toBe(0);
    expect(where.createdAt.lte.getHours()).toBe(23);
    expect(where.createdAt.lte.getMinutes()).toBe(59);
    expect(where.createdAt.gte.getTime()).toBeLessThan(where.createdAt.lte.getTime());
  });

  it("supports a From-only (open-ended) range", () => {
    const where = createdAtBetween("2026-06-01", null) as {
      createdAt: { gte?: Date; lte?: Date };
    };
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(where.createdAt.lte).toBeUndefined();
    expect(where.createdAt.gte!.getHours()).toBe(0);
  });

  it("supports a To-only (open-ended) range", () => {
    const where = createdAtBetween(null, "2026-06-30") as {
      createdAt: { gte?: Date; lte?: Date };
    };
    expect(where.createdAt.lte).toBeInstanceOf(Date);
    expect(where.createdAt.gte).toBeUndefined();
    expect(where.createdAt.lte!.getHours()).toBe(23);
  });

  it("normalizes swapped bounds (From after To)", () => {
    const where = createdAtBetween("2026-06-30", "2026-06-01") as {
      createdAt: { gte: Date; lte: Date };
    };
    expect(where.createdAt.gte.getTime()).toBeLessThan(where.createdAt.lte.getTime());
  });

  it("drops the condition entirely when both bounds are empty", () => {
    expect(createdAtBetween(null, null)).toEqual({});
  });

  it("AND-composes the date range with another condition (e.g. quick search)", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [
        { field: "__quickSearch", operator: "contains", value: "acme" },
        { field: "createdAt", operator: "between", value: "2026-06-01", valueTo: "2026-06-30" },
      ],
    }) as { AND: Record<string, unknown>[] };
    expect(Array.isArray(where.AND)).toBe(true);
    expect(where.AND).toHaveLength(2);
    // The createdAt fragment is present alongside the search OR fragment.
    const hasCreatedAt = where.AND.some((frag) => "createdAt" in frag);
    const hasSearch = where.AND.some((frag) => "OR" in frag);
    expect(hasCreatedAt).toBe(true);
    expect(hasSearch).toBe(true);
  });
});
