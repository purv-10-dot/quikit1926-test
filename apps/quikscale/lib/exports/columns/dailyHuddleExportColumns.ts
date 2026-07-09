/**
 * Server-side column registry for the Daily Huddle export.
 *
 * Keys match the Daily Huddle table (daily-huddle/page.tsx `moduleColumns`).
 * Date-based module: the interval filters the `meetingDate` range (row filter);
 * one row per huddle.
 */
import type { Cell } from "../buildWorkbook";

export interface DailyHuddleExportRow {
  meetingDate: Date | null;
  clientName: string;
  callStatus: string | null;
  absentMemberNames: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  yesterdaysAchievements: boolean;
  todaysPriority: boolean;
  stuckIssues: boolean;
  notesKPDashboard: string | null;
  otherNotes: string | null;
  createdByName: string;
  updatedByName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface DailyHuddleExportColumn {
  key: string;
  label: string;
  value: (row: DailyHuddleExportRow) => Cell;
}

const fmtDate = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : "");
const yn = (b: boolean): string => (b ? "YES" : "NO");

const COLUMNS: DailyHuddleExportColumn[] = [
  { key: "meetingDate", label: "Meeting Date", value: (r) => fmtDate(r.meetingDate) },
  { key: "client", label: "Client Name", value: (r) => r.clientName },
  { key: "callStatus", label: "Call Status", value: (r) => r.callStatus ?? "" },
  { key: "absentMembers", label: "Absent Members", value: (r) => r.absentMemberNames },
  { key: "actualStartTime", label: "Actual Start Time", value: (r) => r.actualStartTime ?? "" },
  { key: "actualEndTime", label: "Actual End Time", value: (r) => r.actualEndTime ?? "" },
  { key: "yesterdaysAchievements", label: "Yesterday's Achievements", value: (r) => yn(r.yesterdaysAchievements) },
  { key: "todaysPriority", label: "Today's Priority", value: (r) => yn(r.todaysPriority) },
  { key: "stuckIssues", label: "Stuck Issues", value: (r) => yn(r.stuckIssues) },
  { key: "notesKPDashboard", label: "Notes K&P Dashboard", value: (r) => r.notesKPDashboard ?? "" },
  { key: "otherNotes", label: "Other Notes", value: (r) => r.otherNotes ?? "" },
  { key: "createdBy", label: "Created By", value: (r) => r.createdByName },
  { key: "updatedBy", label: "Updated By", value: (r) => r.updatedByName },
  { key: "createdAt", label: "Created Date", value: (r) => fmtDate(r.createdAt) },
  { key: "updatedAt", label: "Updated Date", value: (r) => fmtDate(r.updatedAt) },
];

export function dailyHuddleExportColumns(columnKeys: string[]): DailyHuddleExportColumn[] {
  if (columnKeys.length === 0) return COLUMNS;
  const wanted = new Set(columnKeys);
  return COLUMNS.filter((c) => wanted.has(c.key));
}
