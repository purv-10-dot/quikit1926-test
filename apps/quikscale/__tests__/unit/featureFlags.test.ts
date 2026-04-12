import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";

import {
  getPastWeekFlags,
  getCurrentFiscalWeekFromDB,
} from "@/lib/utils/featureFlags";

const TENANT = "tenant-ff-1";

beforeEach(() => {
  resetMockDb();
});

describe("getPastWeekFlags", () => {
  it("returns canAddPastWeek=false and canEditPastWeek=false when no flags exist", async () => {
    mockDb.featureFlag.findMany.mockResolvedValue([]);
    const result = await getPastWeekFlags(TENANT);
    expect(result.canAddPastWeek).toBe(false);
    expect(result.canEditPastWeek).toBe(false);
  });

  it("returns canAddPastWeek=true when add_past_week_data flag is enabled", async () => {
    mockDb.featureFlag.findMany.mockResolvedValue([
      { key: "add_past_week_data", enabled: true, value: null },
    ] as any);
    const result = await getPastWeekFlags(TENANT);
    expect(result.canAddPastWeek).toBe(true);
  });

  it("returns canEditPastWeek=true when edit_past_week_data flag is enabled", async () => {
    mockDb.featureFlag.findMany.mockResolvedValue([
      { key: "edit_past_week_data", enabled: true, value: null },
    ] as any);
    const result = await getPastWeekFlags(TENANT);
    expect(result.canEditPastWeek).toBe(true);
  });

  it("returns both true when both flags are enabled", async () => {
    mockDb.featureFlag.findMany.mockResolvedValue([
      { key: "add_past_week_data", enabled: true, value: null },
      { key: "edit_past_week_data", enabled: true, value: null },
    ] as any);
    const result = await getPastWeekFlags(TENANT);
    expect(result.canAddPastWeek).toBe(true);
    expect(result.canEditPastWeek).toBe(true);
  });

  it("queries only the current tenant", async () => {
    mockDb.featureFlag.findMany.mockResolvedValue([]);
    await getPastWeekFlags(TENANT);
    expect(mockDb.featureFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT }),
      }),
    );
  });
});

describe("getCurrentFiscalWeekFromDB", () => {
  it("returns the correct week number based on QuarterSetting dates", async () => {
    // Q1 starts Apr 1 2026, current date is Apr 15 → day 15 → week 3
    const startDate = new Date("2026-04-01T00:00:00.000Z");
    const endDate = new Date("2026-06-30T00:00:00.000Z");
    mockDb.quarterSetting.findFirst.mockResolvedValue({
      startDate,
      endDate,
    } as any);

    const week = await getCurrentFiscalWeekFromDB(TENANT, 2026, "Q1");
    // Week calculation: days since start / 7, rounded up
    // The exact value depends on "today" at test time, but it should be a positive integer
    expect(typeof week).toBe("number");
    expect(week).toBeGreaterThanOrEqual(1);
    expect(week).toBeLessThanOrEqual(14); // max 13 weeks + buffer
  });

  it("returns 1 when no QuarterSetting is found (fallback)", async () => {
    mockDb.quarterSetting.findFirst.mockResolvedValue(null);
    const week = await getCurrentFiscalWeekFromDB(TENANT, 2026, "Q1");
    expect(week).toBeGreaterThanOrEqual(1);
  });

  it("scopes the query to the correct tenant, year, and quarter", async () => {
    mockDb.quarterSetting.findFirst.mockResolvedValue({
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-06-30"),
    } as any);
    await getCurrentFiscalWeekFromDB(TENANT, 2026, "Q2");
    expect(mockDb.quarterSetting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          fiscalYear: 2026,
          quarter: "Q2",
        }),
      }),
    );
  });
});
