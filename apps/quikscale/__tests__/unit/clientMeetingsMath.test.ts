import { describe, it, expect } from "vitest";
import {
  calculateWeeklyMonthlyStats,
  computeMemberPunchIn,
  calculateOverallFinalAverage,
  monthsInRange,
  parseYearMonth,
  parseYearMonthNum,
  type WeeklyMeetingForMath,
} from "../../lib/services/clientMeetingsMath";

/**
 * Regression: "Quality of the dashboards" (avgAuality) must equal the Member
 * Punch-In Excel "Total Average of All Members". The bug was that the dashboard
 * averaged per-MEETING member-averages (meeting-weighted), which diverged from
 * the member-weighted Excel figure whenever a month had 2+ meetings with
 * uneven attendance. With a single meeting the two always agreed; the defect
 * only surfaced once two or more meetings were held.
 *
 * Scenario mirrors the reported "testing team" June export (4 members, 2
 * meetings, with NA / Absent members on the first meeting).
 */

const JUNE = [{ year: 2026, month: 5 }]; // month is 0-indexed (5 = June)

type Score = { kpiWeeklyQTD: number; kpiCoding: number; priorityNotes: number; priorityStartEndDate: number; priorityColor: number };
const score = (userId: string, s: Score) => ({ userId, ...s });

function meeting(
  date: string,
  memberScores: ReturnType<typeof score>[],
  absentUserIds: string[] = [],
  dashboardNAUserIds: string[] = [],
): WeeklyMeetingForMath {
  return {
    meetingDate: new Date(`${date}T00:00:00.000Z`),
    callStatus: "HELD",
    actualStartTime: "10:00",
    actualEndTime: "11:00",
    goodNewsSharing: "YES", kpDashboard: "YES", www: "YES", feedback: "YES",
    collectiveIntelligence: "YES", gaps: "YES", opspReview: "YES",
    punctualityOverride: "NA",
    totalMembers: 4, absentCount: 0,
    memberScores,
    absentUserIds, dashboardNAUserIds,
  };
}

const ROSTER = [
  { id: "ashwin", name: "Ashwin Signone" },
  { id: "minal", name: "Minal Singh" },
  { id: "amit", name: "Amit Kumar Yadav" },
  { id: "satyajit", name: "Satyajit Sengupta" },
];

// 06-01: Minal is Dashboard-NA, Satyajit is Absent — Ashwin + Amit are scored.
// 06-11: all four scored.
const meetings: WeeklyMeetingForMath[] = [
  meeting("2026-06-01", [
    score("ashwin", { kpiWeeklyQTD: 10, kpiCoding: 10, priorityNotes: 100, priorityStartEndDate: 100, priorityColor: 10 }),
    score("amit",   { kpiWeeklyQTD: 10, kpiCoding: 10, priorityNotes: 10,  priorityStartEndDate: 100, priorityColor: 100 }),
  ], ["satyajit"], ["minal"]),
  meeting("2026-06-11", [
    score("ashwin",   { kpiWeeklyQTD: 10, kpiCoding: 100, priorityNotes: 15, priorityStartEndDate: 5,  priorityColor: 55 }),
    score("minal",    { kpiWeeklyQTD: 55, kpiCoding: 2,   priorityNotes: 77, priorityStartEndDate: 88, priorityColor: 22 }),
    score("amit",     { kpiWeeklyQTD: 11, kpiCoding: 55,  priorityNotes: 8,  priorityStartEndDate: 8,  priorityColor: 88 }),
    score("satyajit", { kpiWeeklyQTD: 88, kpiCoding: 88,  priorityNotes: 55, priorityStartEndDate: 55, priorityColor: 55 }),
  ]),
];

describe("calculateWeeklyMonthlyStats › Quality of the dashboards (avgAuality)", () => {
  it("matches the member-weighted Excel value (50%) with two meetings + uneven attendance", () => {
    const [june] = calculateWeeklyMonthlyStats(meetings, JUNE, "10:00", "11:00", ROSTER);
    // Member totals: Ashwin 42, Minal 49, Amit 40, Satyajit 68 → mean 49.75 → 50.
    expect(june.avgAuality).toBe(50);
  });

  it("equals computeMemberPunchIn + calculateOverallFinalAverage over the same scores", () => {
    // Build the equivalent per-member punch reports (the Excel path) directly,
    // independent of calculateWeeklyMonthlyStats's internals.
    const punchMeetings = meetings.map((m, i) => ({
      id: `m${i}`, meetingDate: m.meetingDate, callStatus: "HELD" as const,
      absentUserIds: m.absentUserIds, dashboardNAUserIds: m.dashboardNAUserIds,
      memberScores: m.memberScores,
    }));
    const reports = ROSTER.map(mem => computeMemberPunchIn(punchMeetings, mem));
    const excelOverall = calculateOverallFinalAverage(reports);

    const [june] = calculateWeeklyMonthlyStats(meetings, JUNE, "10:00", "11:00", ROSTER);
    expect(june.avgAuality).toBe(excelOverall);
    expect(excelOverall).toBe(50);
  });

  it("still agrees with the single-meeting case (no weighting to disturb)", () => {
    const single = [meetings[1]]; // the full 4-member meeting
    const [june] = calculateWeeklyMonthlyStats(single, JUNE, "10:00", "11:00", ROSTER);
    // Ashwin 37→37, Minal 48.8→49, Amit 34→34, Satyajit 68.2→68 → mean 47.0
    // (computeMemberPunchIn rounds each member total: 37,49,34,68 → 47.0)
    const reports = ROSTER.map(mem => computeMemberPunchIn(
      [{ id: "m", meetingDate: single[0].meetingDate, callStatus: "HELD" as const, absentUserIds: [], dashboardNAUserIds: [], memberScores: single[0].memberScores }],
      mem,
    ));
    expect(june.avgAuality).toBe(calculateOverallFinalAverage(reports));
  });

  it("returns 0 when the roster is empty", () => {
    const empty = [meeting("2026-06-04", [])];
    const [june] = calculateWeeklyMonthlyStats(empty, JUNE, "10:00", "11:00", []);
    expect(june.avgAuality).toBe(0);
  });

  it("ignores a stale score row when the member is flagged Absent/NA on that same meeting (matches computeMemberPunchIn)", () => {
    // A member was scored, then later marked Absent/Dashboard-NA for that same
    // meeting (or vice versa) — the ClientWeeklyMemberScore row is never
    // cleared automatically, so it must be excluded here exactly like the
    // Excel Member Punch-In export excludes it.
    const stale = [
      meeting(
        "2026-06-01",
        [
          score("ashwin", { kpiWeeklyQTD: 10, kpiCoding: 10, priorityNotes: 100, priorityStartEndDate: 100, priorityColor: 10 }),
          // Minal has a saved score row but is ALSO flagged Dashboard-NA for
          // this meeting — the flag must win.
          score("minal", { kpiWeeklyQTD: 90, kpiCoding: 90, priorityNotes: 90, priorityStartEndDate: 90, priorityColor: 90 }),
        ],
        [],
        ["minal"],
      ),
    ];
    const roster = [{ id: "ashwin", name: "A" }, { id: "minal", name: "M" }];
    const [june] = calculateWeeklyMonthlyStats(stale, JUNE, "10:00", "11:00", roster);

    const punchMeetings = stale.map((m, i) => ({
      id: `m${i}`, meetingDate: m.meetingDate, callStatus: "HELD" as const,
      absentUserIds: m.absentUserIds, dashboardNAUserIds: m.dashboardNAUserIds,
      memberScores: m.memberScores,
    }));
    const reports = roster.map(mem => computeMemberPunchIn(punchMeetings, mem));
    // Mirror the export route's eligibility filter (excludes members who were
    // AB/NA in every meeting — Minal has zero numeric weeks here).
    const eligibleReports = reports.filter(rep => rep.weeks.some(w => typeof w.kpiWeeklyQTD === "number"));
    const excelOverall = calculateOverallFinalAverage(eligibleReports);

    expect(june.avgAuality).toBe(excelOverall);
    // Only Ashwin counts (Minal excluded despite the stale row, and dropped
    // from the average rather than counted as 0 since her only week is NA):
    // mean of his 5 rounded KPIs = round((10+10+100+100+10)/5) = 46.
    expect(june.avgAuality).toBe(46);
  });

  it("excludes a member's score when they're no longer on the roster (removed from the client's team)", () => {
    // Reported bug: "Anand Krishnan" had ClientWeeklyMemberScore rows from
    // when he was on a client's team, but was later removed from the roster
    // (no ClientTeamMember link). The dashboard must ignore those leftover
    // rows — same as the Excel export, which only ever loops the roster.
    const withGhost = [
      meeting("2026-06-01", [
        score("alice", { kpiWeeklyQTD: 80, kpiCoding: 80, priorityNotes: 80, priorityStartEndDate: 80, priorityColor: 80 }),
        score("ghost", { kpiWeeklyQTD: 100, kpiCoding: 100, priorityNotes: 100, priorityStartEndDate: 100, priorityColor: 100 }),
      ]),
    ];
    const roster = [{ id: "alice", name: "Alice" }]; // "ghost" is not on the roster
    const [june] = calculateWeeklyMonthlyStats(withGhost, JUNE, "10:00", "11:00", roster);
    expect(june.avgAuality).toBe(80); // ghost's 100 must not pull the average up
  });

  it("counts a present, non-flagged, never-scored roster member as 0 (matches computeMemberPunchIn's fallback)", () => {
    // Reported bug: "Mr. Sanjay Nagargoje" was present at a meeting (not
    // Absent/NA-flagged) but nobody entered his KPI scores that week. The
    // export defaults an unscored present week to 0 and counts it; the old
    // dashboard formula silently skipped such members instead of penalizing
    // them, so it disagreed with the export whenever this happened.
    const withUnscored = [
      meeting("2026-06-01", [
        score("alice", { kpiWeeklyQTD: 80, kpiCoding: 80, priorityNotes: 80, priorityStartEndDate: 80, priorityColor: 80 }),
        // "bob" has no memberScores row and no Absent/NA flag for this meeting.
      ]),
    ];
    const roster = [{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }];
    const [june] = calculateWeeklyMonthlyStats(withUnscored, JUNE, "10:00", "11:00", roster);
    expect(june.avgAuality).toBe(40); // mean(80, 0) — Bob counts as 0, not omitted
  });
});

/**
 * Regression: the Daily/Weekly export must include ONLY the months in the
 * selected From→To range. The export routes used to ignore from/to and emit a
 * rolling "last 6 months" window, so a March→April request leaked Jan/Feb/etc.
 */
describe("monthsInRange (export date-range filter)", () => {
  it("returns exactly the selected range, oldest-first (March → April)", () => {
    // month is 0-indexed: March = 2, April = 3
    expect(monthsInRange({ year: 2026, month: 2 }, { year: 2026, month: 3 })).toEqual([
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
    ]);
  });

  it("returns a single month when from === to", () => {
    expect(monthsInRange({ year: 2026, month: 3 }, { year: 2026, month: 3 })).toEqual([
      { year: 2026, month: 3 },
    ]);
  });

  it("spans a year boundary", () => {
    expect(monthsInRange({ year: 2025, month: 10 }, { year: 2026, month: 1 })).toEqual([
      { year: 2025, month: 10 }, // Nov 2025
      { year: 2025, month: 11 }, // Dec 2025
      { year: 2026, month: 0 },  // Jan 2026
      { year: 2026, month: 1 },  // Feb 2026
    ]);
  });

  it("swaps an inverted range instead of returning nothing", () => {
    expect(monthsInRange({ year: 2026, month: 3 }, { year: 2026, month: 2 })).toEqual([
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
    ]);
  });

  it("caps an absurd span to the most recent maxMonths", () => {
    const out = monthsInRange({ year: 2000, month: 0 }, { year: 2026, month: 0 }, 6);
    expect(out).toHaveLength(6);
    expect(out[out.length - 1]).toEqual({ year: 2026, month: 0 });
    expect(out[0]).toEqual({ year: 2025, month: 7 }); // Aug 2025 → Jan 2026 = 6 months
  });
});

describe("parseYearMonth / parseYearMonthNum (export body parsing)", () => {
  it('parses a "YYYY-MM" string to a 0-indexed month', () => {
    expect(parseYearMonth("2026-03")).toEqual({ year: 2026, month: 2 });
  });

  it("rejects invalid month strings", () => {
    expect(parseYearMonth("2026-13")).toBeNull();
    expect(parseYearMonth("2026-00")).toBeNull();
    expect(parseYearMonth(null)).toBeNull();
    expect(parseYearMonth("garbage")).toBeNull();
  });

  it("parses a numeric year + 1-indexed month", () => {
    expect(parseYearMonthNum(2026, 4)).toEqual({ year: 2026, month: 3 });
    expect(parseYearMonthNum(2026, 13)).toBeNull();
    expect(parseYearMonthNum(2026, undefined)).toBeNull();
  });
});
