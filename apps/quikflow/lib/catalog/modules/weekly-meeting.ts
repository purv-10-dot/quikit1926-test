import type { ModuleDef } from "./types";
import { auditFields } from "./audit-fields";

const FLAG = ["YES", "NO", "NA"];
const CALL_STATUS = ["HELD", "NOT_HELD", "CALL_CANCELLED_BY_CLIENT", "HOLIDAY_FOR_CLIENT", "HOLIDAY_FOR_SUCCESS_ALCHEMIST", "OTHER"];

/**
 * Weekly Meeting (Meeting Rhythm) — one row per weekly L10-style meeting.
 * Backed by `ClientWeeklyMeeting`. The seven agenda flags mirror the form spec
 * (Good News → OPSP Review). `clientName` is carried on the emitter payload.
 */
export const WEEKLY_MEETING_MODULE: ModuleDef = {
  key: "weeklyMeeting",
  label: "Weekly Meeting",
  recordNoun: "a weekly meeting",
  capabilities: { trigger: true, condition: true, action: true },
  binding: { model: "clientWeeklyMeeting", softDelete: true, readable: true },
  fields: [
    { key: "client", label: "Client", type: "text", usableIn: ["condition"], column: "clientId" },
    { key: "clientName", label: "Client name", type: "text", usableIn: ["condition"], derived: true },
    { key: "meetingDate", label: "Meeting date", type: "date", usableIn: ["trigger", "condition"], column: "meetingDate" },
    { key: "callStatus", label: "Call status", type: "status", usableIn: ["trigger", "condition"], values: CALL_STATUS, column: "callStatus" },
    { key: "actualStartTime", label: "Actual start (HH:mm)", type: "text", usableIn: ["condition"], column: "actualStartTime" },
    { key: "actualEndTime", label: "Actual end (HH:mm)", type: "text", usableIn: ["condition"], column: "actualEndTime" },
    { key: "goodNewsSharing", label: "Good news sharing", type: "dropdown", usableIn: ["condition"], values: FLAG, column: "goodNewsSharing" },
    { key: "kpDashboard", label: "K&P dashboard", type: "dropdown", usableIn: ["condition"], values: FLAG, column: "kpDashboard" },
    { key: "gaps", label: "GAPS", type: "dropdown", usableIn: ["condition"], values: FLAG, column: "gaps" },
    { key: "www", label: "WWW", type: "dropdown", usableIn: ["condition"], values: FLAG, column: "www" },
    { key: "feedback", label: "Customer/employee feedback", type: "dropdown", usableIn: ["condition"], values: FLAG, column: "feedback" },
    { key: "collectiveIntelligence", label: "Collective intelligence", type: "dropdown", usableIn: ["condition"], values: FLAG, column: "collectiveIntelligence" },
    { key: "opspReview", label: "OPSP review", type: "dropdown", usableIn: ["condition"], values: FLAG, column: "opspReview" },
    ...auditFields({ createdBy: true, updatedBy: true }),
  ],
  events: [
    { id: "weeklyMeeting.logged", label: "A weekly meeting is logged", firesWhen: "A weekly meeting record is created", payloadFields: ["client", "clientName", "meetingDate", "callStatus"], live: true },
    { id: "weeklyMeeting.status.changed", label: "A weekly meeting's call status changes", firesWhen: "callStatus transitions", payloadFields: ["callStatus", "before", "after"], live: true },
    { id: "weeklyMeeting.not_held", label: "A weekly meeting is not held", firesWhen: "callStatus is not HELD", payloadFields: ["callStatus"] },
    { id: "weeklyMeeting.transcript.attached", label: "A weekly meeting transcript is attached", firesWhen: "A Fathom transcript is matched to this weekly meeting", payloadFields: ["client", "clientName", "meetingDate", "recordingId"], live: true },
  ],
  actionIds: [
    "notify.inapp.send",
    "notify.email.send",
    "quikscale.save_transcript",
    "www.create",
    "priority.create",
    "webhook.post",
    "flow.wait",
  ],
};
