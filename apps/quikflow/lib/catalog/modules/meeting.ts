import type { ModuleDef } from "./types";
import { auditFields } from "./audit-fields";

/**
 * Meeting Rhythm — doc §1.4. No dedicated Prisma model exists yet, so records
 * are not readable in v1 (`readable: false`); the module is authorable via the
 * inline value lists. Wire `binding.model` once QuikScale exposes a meeting
 * table in the standard envelope.
 */
export const MEETING_MODULE: ModuleDef = {
  key: "meeting",
  label: "Meeting Rhythm",
  recordNoun: "a meeting",
  capabilities: { trigger: true, condition: true, action: true },
  binding: { readable: false },
  fields: [
    { key: "status", label: "Status", type: "status", usableIn: ["trigger", "condition"], values: ["scheduled", "started", "completed", "cancelled"] },
    { key: "type", label: "Type", type: "dropdown", usableIn: ["trigger", "condition"], values: ["daily_huddle", "weekly_l10"] },
    { key: "score", label: "Meeting score", type: "number", usableIn: ["trigger", "condition"], description: "Weekly meeting score 1–10." },
    { key: "attendancePct", label: "Attendance %", type: "number", usableIn: ["condition"] },
    { key: "date", label: "Date", type: "date", usableIn: ["trigger", "condition"] },
    { key: "facilitator", label: "Facilitator", type: "people", usableIn: ["condition", "action"], source: "master:users" },
    ...auditFields({ createdBy: true, updatedBy: true, backed: false }),
  ],
  // doc §4.5 — none live yet.
  events: [
    { id: "meeting.created", label: "A meeting is created / scheduled", firesWhen: "Meeting scheduled", payloadFields: ["type", "date"] },
    { id: "meeting.before", label: "N minutes/hours before a meeting", firesWhen: "Reminder offset before start", payloadFields: ["offset"] },
    { id: "meeting.ended", label: "A meeting ends", firesWhen: "Meeting completed", payloadFields: ["score", "attendancePct"] },
    { id: "meeting.score.low", label: "The meeting score is below a value", firesWhen: "Meeting score < threshold", payloadFields: ["score", "type"] },
    { id: "meeting.score.dropped", label: "The score drops vs last meeting", firesWhen: "Score lower than previous", payloadFields: ["delta"] },
    { id: "meeting.attendance.low", label: "Attendance is below X%", firesWhen: "Attendance < threshold", payloadFields: ["attendancePct"] },
    { id: "meeting.member.absent", label: "A specific member is absent", firesWhen: "A watched member misses", payloadFields: ["facilitator"] },
    { id: "meeting.not_held", label: "A scheduled meeting is not held", firesWhen: "Meeting skipped", payloadFields: ["date"] },
    { id: "meeting.todo.carried", label: "A to-do is carried over again", firesWhen: "Action item rolls over", payloadFields: ["facilitator"] },
  ],
  actionIds: ["notify.inapp.send", "notify.email.send"],
};
