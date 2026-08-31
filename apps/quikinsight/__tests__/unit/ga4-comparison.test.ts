import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pins the request GA4 actually receives, and the parsing of its multi-range
 * response shape. Both were wrong before: the old implementation asked for the
 * older half of the current window vs a full prior window, and read both
 * periods off metricValues[0]/[1] of a single row — so the delta was always 0.
 */

const runReport = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
        on() {}
      },
    },
    analyticsdata: () => ({ properties: { runReport } }),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    platformConnection: {
      findFirst: vi.fn().mockResolvedValue({
        id: "conn1",
        status: "CONNECTED",
        platform: "GOOGLE_ANALYTICS",
        accessToken: "tok",
        refreshToken: "ref",
        metadata: { propertyId: "12345" },
      }),
      update: vi.fn(),
    },
  },
}));

import { getGA4Comparison } from "@/lib/connectors/google";
import { resolvePeriod } from "@/lib/period/resolve";

const NOW = new Date("2026-08-17T12:00:00Z");

/** GA4 returns one row per date range, tagged by a trailing dimension value. */
function twoRangeResponse(current: number, previous: number) {
  return {
    data: {
      metricHeaders: [{ name: "sessions" }],
      rows: [
        { dimensionValues: [{ value: "date_range_0" }], metricValues: [{ value: String(current) }] },
        { dimensionValues: [{ value: "date_range_1" }], metricValues: [{ value: String(previous) }] },
      ],
    },
  };
}

beforeEach(() => {
  runReport.mockReset();
});

describe("getGA4Comparison", () => {
  it("sends exactly the two absolute windows it was given", async () => {
    runReport.mockResolvedValue(twoRangeResponse(1200, 1000));
    const period = resolvePeriod({ preset: 7, compare: "wow" }, NOW);

    await getGA4Comparison("u1", period);

    const body = runReport.mock.calls[0][0].requestBody;
    expect(body.dateRanges).toEqual([
      { startDate: "2026-08-11", endDate: "2026-08-17", name: "current" },
      { startDate: "2026-08-04", endDate: "2026-08-10", name: "previous" },
    ]);
  });

  it("uses absolute dates, never relative daysAgo strings", () => {
    // Relative offsets resolve differently either side of midnight UTC, which
    // would let two connectors compare mismatched windows.
    runReport.mockResolvedValue(twoRangeResponse(1, 1));
    const period = resolvePeriod({ preset: 30, compare: "previous" }, NOW);
    return getGA4Comparison("u1", period).then(() => {
      const json = JSON.stringify(runReport.mock.calls[0][0].requestBody.dateRanges);
      expect(json).not.toMatch(/daysAgo|today/);
    });
  });

  it("reads each range off its own row, not two metricValues on one row", async () => {
    runReport.mockResolvedValue(twoRangeResponse(1200, 1000));
    const period = resolvePeriod({ preset: 7, compare: "wow" }, NOW);

    const out = await getGA4Comparison("u1", period);

    expect(out.sessions.current).toBe(1200);
    expect(out.sessions.previous).toBe(1000);
  });

  it("sends one range and returns a null baseline when comparison is off", async () => {
    runReport.mockResolvedValue({
      data: {
        metricHeaders: [{ name: "sessions" }],
        rows: [{ dimensionValues: [], metricValues: [{ value: "500" }] }],
      },
    });
    const period = resolvePeriod({ preset: 7, compare: "none" }, NOW);

    const out = await getGA4Comparison("u1", period);

    expect(runReport.mock.calls[0][0].requestBody.dateRanges).toHaveLength(1);
    expect(out.sessions.current).toBe(500);
    expect(out.sessions.previous).toBeNull();
  });

  it("supports several metrics at once", async () => {
    runReport.mockResolvedValue({
      data: {
        metricHeaders: [{ name: "sessions" }, { name: "totalUsers" }],
        rows: [
          {
            dimensionValues: [{ value: "date_range_0" }],
            metricValues: [{ value: "10" }, { value: "7" }],
          },
          {
            dimensionValues: [{ value: "date_range_1" }],
            metricValues: [{ value: "20" }, { value: "14" }],
          },
        ],
      },
    });
    const period = resolvePeriod({ preset: 7, compare: "wow" }, NOW);

    const out = await getGA4Comparison("u1", period, undefined, ["sessions", "totalUsers"]);

    expect(out.sessions).toEqual({ current: 10, previous: 20 });
    expect(out.totalUsers).toEqual({ current: 7, previous: 14 });
  });

  it("returns zeros rather than throwing on an empty report", async () => {
    runReport.mockResolvedValue({ data: {} });
    const period = resolvePeriod({ preset: 7, compare: "wow" }, NOW);

    const out = await getGA4Comparison("u1", period);

    expect(out.sessions).toEqual({ current: 0, previous: 0 });
  });
});
