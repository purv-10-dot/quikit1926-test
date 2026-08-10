import { describe, expect, it } from "vitest";
import {
  translateFilterToPrismaWhere,
  resolveRelativeDateRange,
} from "@/lib/services/leads/filter-engine";
import type { LeadFieldDefinition } from "@/types/field-definition";

/**
 * Build 1a — relative date filters.
 *
 * Contract under test (NONE of this exists yet — these are RED):
 *  - a new exported helper `resolveRelativeDateRange(operator, n?, now?)`
 *    returns a { gte: Date; lte: Date } window, computed in IST
 *    (Asia/Kolkata, +05:30) to match the app's DISPLAY_TZ.
 *  - new relative operators are accepted by the engine on BOTH standard
 *    date columns and custom (dynamicFields) date fields — Fix 1 parity.
 *
 * Determinism: every test pins `now` so IST boundary math is exact.
 * NOW = 2026-01-15T10:30:00 IST  ==  2026-01-15T05:00:00Z
 */
const NOW = new Date("2026-01-15T05:00:00.000Z");

/** IST offset helper for expected values: an IST wall-clock time -> the UTC instant. */
function ist(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0, ms = 0): Date {
  // IST is +05:30 with no DST, so subtract 5h30m to get the UTC instant.
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss, ms) - (5 * 60 + 30) * 60 * 1000);
}

describe("resolveRelativeDateRange (IST-based)", () => {
  it("relToday = IST midnight..end-of-day today", () => {
    const r = resolveRelativeDateRange("relToday", undefined, NOW);
    expect(r).not.toBeNull();
    expect(r!.gte.toISOString()).toBe(ist(2026, 1, 15, 0, 0, 0, 0).toISOString());
    expect(r!.lte.toISOString()).toBe(ist(2026, 1, 15, 23, 59, 59, 999).toISOString());
  });

  it("relYesterday = the full IST day before today", () => {
    const r = resolveRelativeDateRange("relYesterday", undefined, NOW);
    expect(r!.gte.toISOString()).toBe(ist(2026, 1, 14, 0, 0, 0, 0).toISOString());
    expect(r!.lte.toISOString()).toBe(ist(2026, 1, 14, 23, 59, 59, 999).toISOString());
  });

  it("relLastNDays (N=30) = start of the day 29 days before .. end of today (30 inclusive IST days)", () => {
    const r = resolveRelativeDateRange("relLastNDays", 30, NOW);
    // Trailing window that includes today => from Dec 17 00:00 IST to Jan 15 23:59:59.999 IST.
    expect(r!.gte.toISOString()).toBe(ist(2025, 12, 17, 0, 0, 0, 0).toISOString());
    expect(r!.lte.toISOString()).toBe(ist(2026, 1, 15, 23, 59, 59, 999).toISOString());
  });

  it("relNextNDays (N=7) = start of today .. end of the day 6 days ahead", () => {
    const r = resolveRelativeDateRange("relNextNDays", 7, NOW);
    expect(r!.gte.toISOString()).toBe(ist(2026, 1, 15, 0, 0, 0, 0).toISOString());
    expect(r!.lte.toISOString()).toBe(ist(2026, 1, 21, 23, 59, 59, 999).toISOString());
  });

  it("relThisMonth = first..last IST day of the current month", () => {
    const r = resolveRelativeDateRange("relThisMonth", undefined, NOW);
    expect(r!.gte.toISOString()).toBe(ist(2026, 1, 1, 0, 0, 0, 0).toISOString());
    expect(r!.lte.toISOString()).toBe(ist(2026, 1, 31, 23, 59, 59, 999).toISOString());
  });

  it("relLastMonth = first..last IST day of the previous month", () => {
    const r = resolveRelativeDateRange("relLastMonth", undefined, NOW);
    expect(r!.gte.toISOString()).toBe(ist(2025, 12, 1, 0, 0, 0, 0).toISOString());
    expect(r!.lte.toISOString()).toBe(ist(2025, 12, 31, 23, 59, 59, 999).toISOString());
  });

  it("relLastNDays with a missing/invalid N returns null (no silent full-range)", () => {
    expect(resolveRelativeDateRange("relLastNDays", undefined, NOW)).toBeNull();
    expect(resolveRelativeDateRange("relLastNDays", 0, NOW)).toBeNull();
    expect(resolveRelativeDateRange("relLastNDays", -3, NOW)).toBeNull();
  });
});

describe("relative date operators on a STANDARD date column", () => {
  it("relLastNDays produces a gte/lte range on the field", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [{ field: "createdAt", operator: "relLastNDays", value: 30 }],
    });
    // Shape assertion (exact instants covered by the helper's own tests).
    expect(where).toHaveProperty("createdAt");
    const c = (where as Record<string, { gte?: unknown; lte?: unknown }>).createdAt;
    expect(c.gte).toBeInstanceOf(Date);
    expect(c.lte).toBeInstanceOf(Date);
  });

  it("relThisMonth produces a gte/lte range on the field", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [{ field: "createdAt", operator: "relThisMonth" }],
    });
    const c = (where as Record<string, { gte?: unknown; lte?: unknown }>).createdAt;
    expect(c.gte).toBeInstanceOf(Date);
    expect(c.lte).toBeInstanceOf(Date);
  });
});

describe("relative date operators on a CUSTOM date field (Fix 1 parity)", () => {
  const customDefs: LeadFieldDefinition[] = [
    {
      key: "payment_date",
      label: "Payment Date",
      fieldType: "Date",
      requirement: "Optional",
      isStandard: false,
      visible: true,
      showInList: false,
    },
  ];

  it("relLastNDays on a custom date field queries dynamicFields with ISO-string bounds", () => {
    const where = translateFilterToPrismaWhere(
      {
        matchMode: "ALL",
        conditions: [{ field: "payment_date", operator: "relLastNDays", value: 30 }],
      },
      customDefs,
    );
    // Expect an AND of two dynamicFields path comparisons (gte/lte) as ISO strings,
    // mirroring how the existing `between`/`on` custom-date logic emits bounds.
    expect(JSON.stringify(where)).toContain("payment_date");
    expect(JSON.stringify(where)).toContain("gte");
    expect(JSON.stringify(where)).toContain("lte");
    // ISO strings, not Date objects, on the JSON path.
    const s = JSON.stringify(where);
    expect(s).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
