/**
 * Server-side column registry for the Weekly Meeting export.
 *
 * Keys match the Weekly Meeting table (weekly-meeting/page.tsx `MODULE_COLUMNS`).
 * The 7 agenda-item "…Time" columns map to segmentTime1..7 in agenda order.
 * Date-based module: the interval filters the `meetingDate` range.
 */
import type { Cell } from "../buildWorkbook";

export interface WeeklyMeetingExportRow {
  meetingDate: Date | null;
  clientName: string;
  callStatus: string | null;
  absentMemberNames: string;
  dashboardNANames: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  goodNewsSharing: string | null;
  kpDashboard: string | null;
  gaps: string | null;
  www: string | null;
  feedback: string | null;
  collectiveIntelligence: string | null;
  opspReview: string | null;
  segmentTime1: string | null;
  segmentTime2: string | null;
  segmentTime3: string | null;
  segmentTime4: string | null;
  segmentTime5: string | null;
  segmentTime6: string | null;
  segmentTime7: string | null;
  createdByName: string;
  updatedByName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface WeeklyMeetingExportColumn {
  key: string;
  label: string;
  value: (row: WeeklyMeetingExportRow) => Cell;
}

const fmtDate = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : "");

const COLUMNS: WeeklyMeetingExportColumn[] = [
  { key: "meetingDate", label: "Meeting Date", value: (r) => fmtDate(r.meetingDate) },
  { key: "client", label: "Client Name", value: (r) => r.clientName },
  { key: "callStatus", label: "Status", value: (r) => r.callStatus ?? "" },
  { key: "absentMembers", label: "Absent Members", value: (r) => r.absentMemberNames },
  { key: "weeklyDashboardNA", label: "Weekly Dashboard NA", value: (r) => r.dashboardNANames },
  { key: "actualStartTime", label: "Actual Start Time", value: (r) => r.actualStartTime ?? "" },
  { key: "actualEndTime", label: "Actual End Time", value: (r) => r.actualEndTime ?? "" },
  { key: "goodNewsSharing", label: "Good News Sharing", value: (r) => r.goodNewsSharing ?? "" },
  { key: "goodNewsSharingTime", label: "Good News Sharing Time", value: (r) => r.segmentTime1 ?? "" },
  { key: "kpDashboard", label: "K&P dashboard", value: (r) => r.kpDashboard ?? "" },
  { key: "kpDashboardTime", label: "K&P dashboard Time", value: (r) => r.segmentTime2 ?? "" },
  { key: "gaps", label: "GAPS", value: (r) => r.gaps ?? "" },
  { key: "gapsTime", label: "GAPS Time", value: (r) => r.segmentTime3 ?? "" },
  { key: "www", label: "WWW", value: (r) => r.www ?? "" },
  { key: "wwwTime", label: "WWW Time", value: (r) => r.segmentTime4 ?? "" },
  { key: "feedback", label: "Customer/Employee Feedback", value: (r) => r.feedback ?? "" },
  { key: "feedbackTime", label: "Customer/Employee Feedback Time", value: (r) => r.segmentTime5 ?? "" },
  { key: "collectiveIntelligence", label: "Collective Intelligence", value: (r) => r.collectiveIntelligence ?? "" },
  { key: "collectiveIntelligenceTime", label: "Collective Intelligence Time", value: (r) => r.segmentTime6 ?? "" },
  { key: "opspReview", label: "OPSP Review", value: (r) => r.opspReview ?? "" },
  { key: "opspTime", label: "OPSP Time", value: (r) => r.segmentTime7 ?? "" },
  { key: "createdBy", label: "Created By", value: (r) => r.createdByName },
  { key: "updatedBy", label: "Updated By", value: (r) => r.updatedByName },
  { key: "createdAt", label: "Created Date", value: (r) => fmtDate(r.createdAt) },
  { key: "updatedAt", label: "Updated Date", value: (r) => fmtDate(r.updatedAt) },
];

export function weeklyMeetingExportColumns(columnKeys: string[]): WeeklyMeetingExportColumn[] {
  if (columnKeys.length === 0) return COLUMNS;
  const wanted = new Set(columnKeys);
  return COLUMNS.filter((c) => wanted.has(c.key));
}
