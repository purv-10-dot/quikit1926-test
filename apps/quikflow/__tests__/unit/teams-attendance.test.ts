import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetMockDb, mockDb } from "../helpers/mockDb";

/**
 * Teams attendance reports — the only signal that can prove somebody missed a
 * meeting, and therefore the one whose failure modes have to be legible.
 */
vi.mock("../../lib/connectors/crypto", () => ({
  encryptSecret: (s: string) => s,
  decryptSecret: (s: string) => s,
}));

import {
  missingCaptureScopes,
  reportForDate,
  resolveCaptureContext,
  TeamsAttendanceError,
  CAPTURE_SCOPES,
  type AttendanceReportSummary,
} from "@/lib/connectors/teams-attendance";

const report = (id: string, start: string | null): AttendanceReportSummary => ({
  id,
  meetingStartDateTime: start,
  meetingEndDateTime: null,
  totalParticipantCount: null,
});

const CONN = {
  id: "conn_1",
  orgId: "org_A",
  provider: "teams",
  label: "organiser@org.com",
  accessToken: "tok",
  refreshToken: "refresh",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  scopes: ["Calendars.ReadWrite", ...CAPTURE_SCOPES],
  settings: null,
};

beforeEach(() => {
  resetMockDb();
});

describe("reportForDate", () => {
  it("picks the report for the requested occurrence, not the newest", () => {
    // THE bug this guards: a recurring huddle stacks every occurrence's report
    // under ONE onlineMeeting id. Taking "the latest" would attach today's
    // attendance to an older week — and since a report is a COMPLETE list of
    // joiners, that marks a whole team absent for a meeting they attended.
    const reports = [
      report("r-mon", "2026-08-24T09:30:00Z"),
      report("r-tue", "2026-08-25T09:30:00Z"),
      report("r-wed", "2026-08-26T09:30:00Z"),
    ];

    expect(reportForDate(reports, "2026-08-25")?.id).toBe("r-tue");
  });

  it("returns null when no report covers that date", () => {
    expect(reportForDate([report("r1", "2026-08-24T09:30:00Z")], "2026-08-25")).toBeNull();
  });

  it("takes the last session when a meeting was restarted on the same date", () => {
    // Restarts leave a stub report a few seconds long; the session that ran is
    // the one that started last.
    const reports = [
      report("r-stub", "2026-08-25T09:29:00Z"),
      report("r-real", "2026-08-25T09:33:00Z"),
    ];

    expect(reportForDate(reports, "2026-08-25")?.id).toBe("r-real");
  });

  it("ignores reports with no start time rather than guessing", () => {
    expect(reportForDate([report("r-null", null)], "2026-08-25")).toBeNull();
  });
});

describe("missingCaptureScopes", () => {
  it("is empty when both read scopes are present, case-insensitively", () => {
    expect(missingCaptureScopes(["onlinemeetings.read.all", "OnlineMeetingArtifact.Read.All"])).toEqual([]);
  });

  it("names exactly what a reconnect has to add", () => {
    expect(missingCaptureScopes(["Calendars.ReadWrite", "OnlineMeetings.Read.All"])).toEqual([
      "OnlineMeetingArtifact.Read.All",
    ]);
  });
});

describe("resolveCaptureContext", () => {
  it("uses the connected mailbox as the organiser, delegated", async () => {
    // Delegated is what avoids the Teams application access policy: the
    // connected mailbox IS the organiser, so its own token reads its own
    // meetings.
    mockDb.wfConnection.findFirst.mockResolvedValue(CONN as never);

    const ctx = await resolveCaptureContext("org_A");

    expect(ctx.mode).toBe("delegated");
    expect(ctx.userPath).toBe("/me");
    expect(ctx.organizer).toBe("organiser@org.com");
  });

  it("asks for a reconnect when the connection predates the capture scopes", async () => {
    // A refresh cannot gain scopes that were never consented, so this must be
    // reported as an actionable reconnect rather than surfacing later as an
    // opaque 403.
    mockDb.wfConnection.findFirst.mockResolvedValue({
      ...CONN,
      scopes: ["Calendars.ReadWrite", "User.Read"],
    } as never);

    await expect(resolveCaptureContext("org_A")).rejects.toMatchObject({
      name: "TeamsAttendanceError",
      reason: "reconnect-required",
    });
  });

  it("never silently falls back to another auth mode when scopes are missing", async () => {
    mockDb.wfConnection.findFirst.mockResolvedValue({ ...CONN, scopes: [] } as never);

    const err = await resolveCaptureContext("org_A").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TeamsAttendanceError);
    // The message has to name the scopes so support can act on it.
    expect((err as TeamsAttendanceError).message).toContain("OnlineMeetings.Read.All");
  });

  it("reports not-connected when the org has no calendar connection", async () => {
    mockDb.wfConnection.findFirst.mockResolvedValue(null as never);

    await expect(resolveCaptureContext("org_A")).rejects.toMatchObject({
      reason: "not-connected",
    });
  });
});
