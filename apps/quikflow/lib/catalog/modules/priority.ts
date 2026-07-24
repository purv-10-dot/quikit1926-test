import type { ModuleDef } from "./types";
import { auditFields } from "./audit-fields";

/**
 * Priority (Rock) — doc §1.2. Status maps to the real `overallStatus` column;
 * `type`, `dueDate` and `progressPct` are conceptual (weekly-status derived) and
 * carry no 1:1 column, so they are authorable in conditions but not projected in
 * record reads until QuikScale exposes them.
 */
export const PRIORITY_MODULE: ModuleDef = {
  key: "priority",
  label: "Priority (Rock)",
  recordNoun: "a Rock",
  capabilities: { trigger: true, condition: true, action: true },
  binding: { model: "priority", softDelete: true, readable: true },
  fields: [
    { key: "name", label: "Name", type: "text", usableIn: ["condition"], column: "name" },
    {
      key: "status",
      label: "Status",
      type: "status",
      usableIn: ["trigger", "condition", "action"],
      // Canonical ItemStatus tokens (apps/quikscale/lib/constants/status.ts).
      values: ["not-applicable", "not-yet-started", "behind-schedule", "on-track", "completed"],
      column: "overallStatus",
    },
    { key: "type", label: "Type", type: "dropdown", usableIn: ["condition"], values: ["company", "team", "individual"] },
    { key: "owner", label: "Owner", type: "people", usableIn: ["trigger", "condition", "action"], source: "master:users", column: "owner" },
    { key: "dueDate", label: "Due date", type: "date", usableIn: ["trigger", "condition"], derived: true, description: "Derived from the priority's end week." },
    { key: "progressPct", label: "Progress %", type: "number", usableIn: ["condition"], derived: true },
    { key: "team", label: "Team", type: "reference", usableIn: ["trigger", "condition"], source: "master:teams", column: "teamId" },
    { key: "quarter", label: "Quarter", type: "reference", usableIn: ["trigger", "condition"], source: "master:quarters", column: "quarter" },
    ...auditFields({ createdBy: true, updatedBy: true }),
  ],
  // doc §4.3 — none live yet (QuikScale doesn't emit Priority events today).
  events: [
    { id: "priority.created", label: "A Rock is created", firesWhen: "New Rock persisted", payloadFields: ["owner", "status"], live: true },
    { id: "priority.imported", label: "A Rock is imported from OPSP", firesWhen: "Rock created from an OPSP", payloadFields: ["owner"] },
    { id: "priority.status.changed", label: "A Rock status changes", firesWhen: "Status transition", payloadFields: ["status", "before", "after"], live: true },
    { id: "priority.status.changed_to", label: "Status changes to a chosen value", firesWhen: "e.g. becomes Behind Schedule / Completed", payloadFields: ["status"] },
    { id: "priority.completed", label: "A Rock is marked Completed", firesWhen: "Status becomes Completed", payloadFields: ["owner", "status"], live: true },
    { id: "priority.blocked", label: "A Rock becomes Blocked", firesWhen: "Status becomes Blocked", payloadFields: ["owner", "reason"] },
    { id: "priority.progress.crosses", label: "Progress crosses N%", firesWhen: "e.g. progress ≥ 50%", payloadFields: ["progressPct"] },
    { id: "priority.progress.stalled", label: "Progress does not move for N weeks", firesWhen: "No progress N weeks", payloadFields: ["weeks"] },
    { id: "priority.date.arrived", label: "Due date reached (or N days before)", firesWhen: "On/near the due date", payloadFields: ["dueDate", "offset"] },
    { id: "priority.overdue", label: "A Rock passes its due date", firesWhen: "Past due, still open", payloadFields: ["dueDate"] },
    { id: "priority.owner.assigned", label: "An owner is set on a Rock", firesWhen: "An owner is assigned", payloadFields: ["owner"] },
    { id: "priority.comment.posted", label: "A note / comment is added", firesWhen: "A note / comment is added", payloadFields: ["author", "text"] },
  ],
  actionIds: [
    "notify.inapp.send",
    "notify.email.send",
    "notify.slack.send",
    "priority.update",
    "priority.complete",
    "priority.reassign",
    "www.create",
    "flow.wait",
    "webhook.post",
  ],
};
