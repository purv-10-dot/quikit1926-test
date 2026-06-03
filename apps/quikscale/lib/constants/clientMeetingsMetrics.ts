/**
 * Single source of truth for the Meeting-Rhythm metric rows (label + stat key).
 *
 * Shared by the live dashboard (`app/(dashboard)/client-meetings/page.tsx`) and
 * the Excel exports (`app/api/client-meetings/export/**`) so the row labels —
 * and their order — never drift between what the user sees on screen and what
 * they download. Previously each surface hard-coded its own labels, which is
 * how the export ended up with short names ("Attendance") while the dashboard
 * showed the full descriptions.
 *
 * `key` maps onto `MonthlyStatRow` (per-month value); `totalKey` maps onto the
 * dashboard `overallStats` object (the "Total Avg" column).
 */

export const DAILY_METRICS = [
  { key: "avgHeld",             label: "Avg. % of Calls happened",                                          totalKey: "TotalavgHeld" },
  { key: "avgPunctual",         label: "Avg. % of Calls where call punctuality was followed",               totalKey: "TotalavgPunctual" },
  { key: "avgDurationFollowed", label: "Avg. % of Calls where call duration + time per member was followed", totalKey: "TotalavgDurationFollowed" },
  { key: "avgFormat",           label: "Avg. % of format being followed",                                   totalKey: "TotalavgFormat" },
  { key: "avgAttendance",       label: "Avg. % of people attending the calls",                              totalKey: "TotalavgAttendance" },
  { key: "avgStuckCalls",       label: "Avg. % of Stucks called out",                                       totalKey: "TotalavgStuckCalls" },
] as const;

export const WEEKLY_METRICS = [
  { key: "avgHeld",             label: "Avg. % of Calls happened",                              totalKey: "TotalavgHeld" },
  { key: "avgPunctual",         label: "Avg. % of Calls where call punctuality was followed",   totalKey: "TotalavgPunctual" },
  { key: "avgDurationFollowed", label: "Average % of call end-time adherence.",                 totalKey: "TotalavgDurationFollowed" },
  { key: "avgAuality",          label: "Quality of the dashboards",                             totalKey: "TotalavgAuality" },
  { key: "avgKP",               label: "Active discussion on K&P achivement gaps & action plan",totalKey: "TotalavgKP" },
  { key: "avgWWW",              label: "WWW review and follow up",                              totalKey: "TotalavgWWW" },
  { key: "avgEF",               label: "Customer and employee feedback segment done",           totalKey: "TotalavgEF" },
  { key: "avgCI",               label: "Collective intelligence discussion done",               totalKey: "TotalavgCI" },
  { key: "avgAttendance",       label: "Avg. % of people attending the calls",                  totalKey: "TotalavgAttendance" },
] as const;
