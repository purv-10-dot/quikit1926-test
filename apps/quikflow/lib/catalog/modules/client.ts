import type { ModuleDef } from "./types";
import { auditFields } from "./audit-fields";

/**
 * Client Master (Meeting Rhythm) — one row per client. Holds the planned
 * Daily Huddle & Weekly meeting windows (HH:mm) that the Fathom matcher uses to
 * classify a transcript's cadence. Backed by the `Client` Prisma model.
 */
export const CLIENT_MASTER_MODULE: ModuleDef = {
  key: "clientMaster",
  label: "Client Master",
  recordNoun: "a client",
  capabilities: { trigger: true, condition: true, action: true },
  binding: { model: "client", softDelete: true, readable: true },
  fields: [
    { key: "name", label: "Client name", type: "text", usableIn: ["trigger", "condition"], column: "name" },
    { key: "isActive", label: "Is active", type: "boolean", usableIn: ["condition"], column: "isActive" },
    // Planned meeting windows — exposed as {{trigger.*}} tokens so a workflow can
    // feed them straight into calendar.event.create (Daily Huddle / Weekly Meeting).
    { key: "dailyStartTime", label: "Daily start (HH:mm)", type: "text", usableIn: ["trigger", "condition"], column: "dailyStartTime" },
    { key: "dailyEndTime", label: "Daily end (HH:mm)", type: "text", usableIn: ["trigger", "condition"], column: "dailyEndTime" },
    { key: "weeklyStartTime", label: "Weekly start (HH:mm)", type: "text", usableIn: ["trigger", "condition"], column: "weeklyStartTime" },
    { key: "weeklyEndTime", label: "Weekly end (HH:mm)", type: "text", usableIn: ["trigger", "condition"], column: "weeklyEndTime" },
    // Team-member emails ride the event payload (a relation, not a column) so
    // they are NOT record-projected — hence no `column`. Exposed as a trigger
    // token to feed calendar.event.create's attendees. See workflowEvents.ts.
    { key: "teamMemberEmails", label: "Team member emails", type: "text", usableIn: ["trigger", "condition"] },
    // Optional attendees ride the same payload for the same reason. Kept as a
    // SEPARATE token rather than a typed list because the calendar action's
    // params are flat strings, and because a workflow that only wants the
    // required roster should not have to filter one.
    { key: "optionalMemberEmails", label: "Optional member emails", type: "text", usableIn: ["trigger", "condition"] },
    // Recurrence tokens for the calendar action — carried PRE-FORMATTED in the
    // event payload (weekday names / comma list / YYYY-MM-DD), so they are
    // payload-only (no column) to keep formatting control (a column would
    // record-load a Date/array and overwrite the payload string). See
    // workflowEvents.ts (clientMasterData).
    { key: "weeklyDay", label: "Weekly meeting day", type: "text", usableIn: ["trigger", "condition"] },
    { key: "dailyDays", label: "Daily huddle days", type: "text", usableIn: ["trigger", "condition"] },
    { key: "meetingUntil", label: "Meetings until (YYYY-MM-DD)", type: "text", usableIn: ["trigger", "condition"] },
    { key: "startDate", label: "Meeting start date (YYYY-MM-DD)", type: "text", usableIn: ["trigger", "condition"] },
    ...auditFields({ createdBy: true, updatedBy: true }),
  ],
  events: [
    { id: "clientMaster.created", label: "A client is created", firesWhen: "A new client is added to Client Master", payloadFields: ["name"], live: true },
    { id: "clientMaster.updated", label: "A client is updated", firesWhen: "A client's details change", payloadFields: ["name"], live: true },
    { id: "clientMaster.times.changed", label: "A client's meeting times change", firesWhen: "Daily/Weekly planned window edited", payloadFields: ["dailyStartTime", "weeklyStartTime"] },
    { id: "clientMaster.deactivated", label: "A client is deactivated", firesWhen: "isActive becomes false", payloadFields: ["name"] },
    { id: "clientMaster.deleted", label: "A client is deleted", firesWhen: "A client is removed from Client Master", payloadFields: ["name"], live: true },
  ],
  actionIds: ["notify.inapp.send", "notify.email.send", "calendar.event.create", "calendar.event.delete", "webhook.post"],
};
