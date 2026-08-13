import type { ModuleDef } from "./types";
import { auditFields } from "./audit-fields";

const FLAG = ["YES", "NO", "NA"];
const CALL_STATUS = ["HELD", "NOT_HELD", "CALL_CANCELLED_BY_CLIENT", "HOLIDAY_FOR_CLIENT", "HOLIDAY_FOR_SUCCESS_ALCHEMIST", "OTHER"];

/**
 * Daily Huddle (Meeting Rhythm) — one row per daily stand-up. Backed by
 * `ClientDailyHuddle`. `clientName` is carried on the emitter payload (derived,
 * no column) so `{{trigger.clientName}}` reads a real name, not the id.
 */
export const DAILY_HUDDLE_MODULE: ModuleDef = {
  key: "dailyHuddle",
  label: "Daily Huddle",
  recordNoun: "a daily huddle",
  capabilities: { trigger: true, condition: true, action: true },
  binding: { model: "clientDailyHuddle", softDelete: true, readable: true },
  fields: [
    { key: "client", label: "Client", type: "text", usableIn: ["condition"], column: "clientId" },
    { key: "clientName", label: "Client name", type: "text", usableIn: ["condition"], derived: true },
    { key: "meetingDate", label: "Meeting date", type: "date", usableIn: ["trigger", "condition"], column: "meetingDate" },
    { key: "callStatus", label: "Call status", type: "status", usableIn: ["trigger", "condition"], values: CALL_STATUS, column: "callStatus" },
    { key: "actualStartTime", label: "Actual start (HH:mm)", type: "text", usableIn: ["condition"], column: "actualStartTime" },
    { key: "actualEndTime", label: "Actual end (HH:mm)", type: "text", usableIn: ["condition"], column: "actualEndTime" },
    { key: "format1Status", label: "Yesterday's achievements", type: "dropdown", usableIn: ["condition"], values: FLAG, column: "format1Status" },
    { key: "format2Status", label: "Today's priority", type: "dropdown", usableIn: ["condition"], values: FLAG, column: "format2Status" },
    { key: "stuckCallStatus", label: "Stuck issues", type: "dropdown", usableIn: ["condition"], values: FLAG, column: "stuckCallStatus" },
    ...auditFields({ createdBy: true, updatedBy: true }),
  ],
  events: [
    { id: "dailyHuddle.logged", label: "A daily huddle is logged", firesWhen: "A daily huddle record is created", payloadFields: ["client", "clientName", "meetingDate", "callStatus"], live: true },
    { id: "dailyHuddle.status.changed", label: "A daily huddle's call status changes", firesWhen: "callStatus transitions", payloadFields: ["callStatus", "before", "after"], live: true },
    { id: "dailyHuddle.not_held", label: "A daily huddle is not held", firesWhen: "callStatus is not HELD", payloadFields: ["callStatus"] },
    { id: "dailyHuddle.transcript.attached", label: "A daily huddle transcript is attached", firesWhen: "A Fathom transcript is matched to this huddle", payloadFields: ["client", "clientName", "meetingDate", "recordingId"], live: true },
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
