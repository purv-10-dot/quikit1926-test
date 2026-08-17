import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A connector must never report a total failure as zeros.
 *
 * Every one of these connectors tolerates individual sub-request failures on
 * purpose (one unsupported GA4 metric shouldn't blank the page). But that
 * tolerance turned a revoked OAuth grant into "0 sessions, 0 users, 0 events" —
 * presented as real data, with no Mock stamp, telling the user they had no
 * traffic. When EVERY request fails there is no data at all, and the connector
 * has to say so.
 */

const runReport = vi.fn();
const channelsList = vi.fn();
const ytQuery = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} on() {} } },
    analyticsdata: () => ({ properties: { runReport, runRealtimeReport: runReport } }),
    youtube: () => ({ channels: { list: channelsList }, search: { list: channelsList }, videos: { list: channelsList } }),
    youtubeAnalytics: () => ({ reports: { query: ytQuery } }),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    platformConnection: {
      findFirst: vi.fn().mockResolvedValue({
        id: "c1",
        status: "CONNECTED",
        accessToken: "tok",
        refreshToken: "ref",
        metadata: { propertyId: "123", channelId: "UC123" },
      }),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { getGA4Data, getYouTubeData } from "@/lib/connectors/google";

const INVALID_GRANT = Object.assign(new Error("invalid_grant"), {
  response: { status: 400, data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } },
});

beforeEach(() => {
  runReport.mockReset();
  channelsList.mockReset();
  ytQuery.mockReset();
});

describe("getGA4Data", () => {
  it("throws when every report fails, instead of returning zeros", async () => {
    runReport.mockRejectedValue(INVALID_GRANT);
    await expect(getGA4Data("u1", 7)).rejects.toThrow(/invalid_grant/);
  });

  it("still tolerates a partial failure", async () => {
    // One bad metric must not blank the page — that tolerance is deliberate.
    runReport.mockImplementation((req: { requestBody?: { metrics?: Array<{ name: string }> } }) => {
      const wantsKeyEvents = req.requestBody?.metrics?.some((m) => m.name === "keyEvents");
      if (wantsKeyEvents) return Promise.reject(new Error("keyEvents unsupported"));
      return Promise.resolve({
        data: { rows: [{ dimensionValues: [{ value: "Organic" }], metricValues: [{ value: "10" }, { value: "8" }, { value: "3" }, { value: "0.4" }] }] },
      });
    });

    const out = await getGA4Data("u1", 7);
    expect(out.totalSessions).toBe(10);
  });
});

describe("getYouTubeData", () => {
  it("throws when every request fails, instead of reporting an empty channel", async () => {
    channelsList.mockRejectedValue(INVALID_GRANT);
    ytQuery.mockRejectedValue(INVALID_GRANT);
    await expect(getYouTubeData("u1", 7)).rejects.toBeTruthy();
  });
});
