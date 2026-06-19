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

function meeting(date: string, memberScores: ReturnType<typeof score>[]): WeeklyMeetingForMath {
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
  };
}

// 06-01: only Ashwin + Amit were scored (Minal = NA, Satyajit = Absent → no rows).
// 06-11: all four scored.
const meetings: WeeklyMeetingForMath[] = [
  meeting("2026-06-01", [
    score("ashwin", { kpiWeeklyQTD: 10, kpiCoding: 10, priorityNotes: 100, priorityStartEndDate: 100, priorityColor: 10 }),
    score("amit",   { kpiWeeklyQTD: 10, kpiCoding: 10, priorityNotes: 10,  priorityStartEndDate: 100, priorityColor: 100 }),
  ]),
  meeting("2026-06-11", [
    score("ashwin",   { kpiWeeklyQTD: 10, kpiCoding: 100, priorityNotes: 15, priorityStartEndDate: 5,  priorityColor: 55 }),
    score("minal",    { kpiWeeklyQTD: 55, kpiCoding: 2,   priorityNotes: 77, priorityStartEndDate: 88, priorityColor: 22 }),
    score("amit",     { kpiWeeklyQTD: 11, kpiCoding: 55,  priorityNotes: 8,  priorityStartEndDate: 8,  priorityColor: 88 }),
    score("satyajit", { kpiWeeklyQTD: 88, kpiCoding: 88,  priorityNotes: 55, priorityStartEndDate: 55, priorityColor: 55 }),
  ]),
];

describe("calculateWeeklyMonthlyStats › Quality of the dashboards (avgAuality)", () => {
  it("matches the member-weighted Excel value (49.75%) with two meetings + uneven attendance", () => {
    const [june] = calculateWeeklyMonthlyStats(meetings, JUNE, "10:00", "11:00");
    expect(june.avgAuality).toBe(49.75);
  });

  it("equals computeMemberPunchIn + calculateOverallFinalAverage over the same scores", () => {
    // Build the equivalent per-member punch reports (the Excel path).
    const members = [
      { id: "ashwin", name: "Ashwin Signone" },
      { id: "minal", name: "Minal Singh" },
      { id: "amit", name: "Amit Kumar Yadav" },
      { id: "satyajit", name: "Satyajit Sengupta" },
    ];
    const punchMeetings = meetings.map((m, i) => ({
      id: `m${i}`,
      meetingDate: m.meetingDate,
      // 06-01: Minal is NA, Satyajit is Absent.
      absentUserIds: i === 0 ? ["satyajit"] : [],
      dashboardNAUserIds: i === 0 ? ["minal"] : [],
      memberScores: m.memberScores,
    }));
    const reports = members.map(mem => computeMemberPunchIn(punchMeetings, mem));
    const excelOverall = calculateOverallFinalAverage(reports);

    const [june] = calculateWeeklyMonthlyStats(meetings, JUNE, "10:00", "11:00");
    expect(june.avgAuality).toBe(excelOverall);
    expect(excelOverall).toBe(49.75);
  });

  it("still agrees with the single-meeting case (no weighting to disturb)", () => {
    const single = [meetings[1]]; // the full 4-member meeting
    const [june] = calculateWeeklyMonthlyStats(single, JUNE, "10:00", "11:00");
    // Ashwin 37→37, Minal 48.8→49, Amit 34→34, Satyajit 68.2→68 → mean 47.0
    // (computeMemberPunchIn rounds each member total: 37,49,34,68 → 47.0)
    const reports = [
      { id: "ashwin", name: "A" }, { id: "minal", name: "M" },
      { id: "amit", name: "Am" }, { id: "satyajit", name: "S" },
    ].map(mem => computeMemberPunchIn(
      [{ id: "m", meetingDate: single[0].meetingDate, absentUserIds: [], dashboardNAUserIds: [], memberScores: single[0].memberScores }],
      mem,
    ));
    expect(june.avgAuality).toBe(calculateOverallFinalAverage(reports));
  });

  it("returns 0 when no member was scored", () => {
    const empty = [meeting("2026-06-04", [])];
    const [june] = calculateWeeklyMonthlyStats(empty, JUNE, "10:00", "11:00");
    expect(june.avgAuality).toBe(0);
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
