import { describe, expect, it } from "vitest";
import { forecastMs } from "@/lib/test/estimate";
import {
  CASE_COLUMNS,
  DEFAULT_CASE_COLUMNS,
} from "@/app/(dashboard)/spaces/[id]/test/_components/case-meta";

/**
 * QUIKTR-335 — Forecast column.
 *
 * Forecast is not stored: it sums known estimates and fills the gaps with the
 * mean of the known ones. The important property is that "nothing known" is
 * reported as unknown rather than as zero, because a 0 forecast reads as "this
 * suite is free to run".
 */

const MIN = 60_000;

describe("forecastMs", () => {
  it("sums when every case has an estimate", () => {
    const f = forecastMs([10 * MIN, 20 * MIN, 30 * MIN]);
    expect(f.totalMs).toBe(60 * MIN);
    expect(f.extrapolated).toBe(false);
    expect(f.estimated).toBe(true);
    expect(f.unknownCount).toBe(0);
  });

  it("fills unknowns with the mean of the known ones", () => {
    // known: 10 + 20 = 30, mean 15; one unknown → 30 + 15 = 45
    const f = forecastMs([10 * MIN, 20 * MIN, null]);
    expect(f.totalMs).toBe(45 * MIN);
    expect(f.extrapolated).toBe(true);
    expect(f.knownCount).toBe(2);
    expect(f.unknownCount).toBe(1);
  });

  it("reports unknown — not zero — when nothing has an estimate", () => {
    const f = forecastMs([null, null, undefined]);
    expect(f.estimated).toBe(false);
    expect(f.knownCount).toBe(0);
    // totalMs is 0 but `estimated: false` is what callers must branch on.
    expect(f.totalMs).toBe(0);
  });

  it("treats an empty list as nothing to forecast", () => {
    expect(forecastMs([]).estimated).toBe(false);
  });

  it("ignores zero and negative estimates as 'not set'", () => {
    // estimateMs 0 means "no estimate", not "instant" — a case cannot take no
    // time, and a stored 0 would otherwise drag the mean down.
    const f = forecastMs([0, -5, 10 * MIN]);
    expect(f.knownCount).toBe(1);
    expect(f.unknownCount).toBe(2);
    expect(f.totalMs).toBe(30 * MIN); // 10 + 10 + 10
  });

  it("scales a single known estimate across the whole list", () => {
    const f = forecastMs([12 * MIN, null, null, null]);
    expect(f.totalMs).toBe(48 * MIN);
  });

  it("rounds to whole milliseconds", () => {
    // mean of 10 and 11 minutes is 10.5 → one unknown must not yield a fraction
    const f = forecastMs([10 * MIN, 11 * MIN, null]);
    expect(Number.isInteger(f.totalMs)).toBe(true);
    expect(f.totalMs).toBe(Math.round(31.5 * MIN));
  });
});

describe("CASE_COLUMNS", () => {
  it("has unique keys", () => {
    expect(new Set(CASE_COLUMNS.map((c) => c.key)).size).toBe(CASE_COLUMNS.length);
  });

  it("does not make ID or Title toggleable", () => {
    // They are the row's identity and its click target — a table with neither is
    // unusable, so they are rendered unconditionally.
    const keys = CASE_COLUMNS.map((c) => c.key as string);
    expect(keys).not.toContain("id");
    expect(keys).not.toContain("title");
  });

  it("shows Labels by default now that labels can be authored", () => {
    // Regression guard for the ordering trap: a label added in the editor must be
    // visible in the list without opening the Columns menu.
    expect(DEFAULT_CASE_COLUMNS).toContain("labels");
  });

  it("derives defaults from the `default` flag", () => {
    expect(DEFAULT_CASE_COLUMNS).toEqual(
      CASE_COLUMNS.filter((c) => c.default).map((c) => c.key),
    );
  });
});
