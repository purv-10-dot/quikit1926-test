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
    { key: "dailyStartTime", label: "Daily start (HH:mm)", type: "text", usableIn: ["condition"], column: "dailyStartTime" },
    { key: "dailyEndTime", label: "Daily end (HH:mm)", type: "text", usableIn: ["condition"], column: "dailyEndTime" },
    { key: "weeklyStartTime", label: "Weekly start (HH:mm)", type: "text", usableIn: ["condition"], column: "weeklyStartTime" },
    { key: "weeklyEndTime", label: "Weekly end (HH:mm)", type: "text", usableIn: ["condition"], column: "weeklyEndTime" },
    ...auditFields({ createdBy: true, updatedBy: true }),
  ],
  events: [
    { id: "clientMaster.created", label: "A client is created", firesWhen: "A new client is added to Client Master", payloadFields: ["name"], live: true },
    { id: "clientMaster.updated", label: "A client is updated", firesWhen: "A client's details change", payloadFields: ["name"], live: true },
    { id: "clientMaster.times.changed", label: "A client's meeting times change", firesWhen: "Daily/Weekly planned window edited", payloadFields: ["dailyStartTime", "weeklyStartTime"] },
    { id: "clientMaster.deactivated", label: "A client is deactivated", firesWhen: "isActive becomes false", payloadFields: ["name"] },
  ],
  actionIds: ["notify.inapp.send", "notify.email.send", "webhook.post"],
};
