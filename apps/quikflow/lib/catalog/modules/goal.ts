import type { ModuleDef } from "./types";
import { auditFields } from "./audit-fields";

/** Goals & Pillars — doc §1.4. Backed by the Goal model. */
export const GOAL_MODULE: ModuleDef = {
  key: "goal",
  label: "Goals & Pillars",
  recordNoun: "a goal",
  capabilities: { trigger: true, condition: true, action: true },
  binding: { model: "goal", softDelete: false, readable: true },
  fields: [
    { key: "title", label: "Title", type: "text", usableIn: ["condition"], column: "title" },
    {
      key: "status",
      label: "Status",
      type: "status",
      usableIn: ["trigger", "condition"],
      // Canonical GOAL_STATUSES (apps/quikscale/lib/schemas/goalSchema.ts).
      values: ["draft", "active", "on-track", "at-risk", "completed", "abandoned"],
      column: "status",
    },
    { key: "progressPercent", label: "Progress %", type: "number", usableIn: ["condition"], column: "progressPercent" },
    { key: "owner", label: "Owner", type: "people", usableIn: ["trigger", "condition", "action"], source: "master:users", column: "ownerId" },
    { key: "pillar", label: "Pillar / Category", type: "reference", usableIn: ["condition"], source: "master:categories", column: "category" },
    { key: "targetValue", label: "Target Value", type: "number", usableIn: ["condition"], column: "targetValue" },
    { key: "currentValue", label: "Current Value", type: "number", usableIn: ["condition"], column: "currentValue" },
    { key: "quarter", label: "Quarter", type: "reference", usableIn: ["trigger", "condition"], source: "master:quarters", column: "quarter" },
    ...auditFields({ createdBy: true }),
  ],
  // doc §4.8 — none live yet.
  events: [
    { id: "goal.created", label: "A goal is created", firesWhen: "New goal persisted", payloadFields: ["pillar", "owner"], live: true },
    { id: "goal.status.changed", label: "A goal status changes", firesWhen: "Status transition", payloadFields: ["status", "before", "after"], live: true },
    { id: "goal.at_risk", label: "A goal becomes At-risk", firesWhen: "Status becomes At-risk", payloadFields: ["owner"], live: true },
    { id: "goal.achieved", label: "A goal is achieved", firesWhen: "Status becomes Completed", payloadFields: ["owner"], live: true },
    { id: "goal.progress.crosses", label: "Progress crosses N%", firesWhen: "Progress crosses a threshold", payloadFields: ["progressPercent"] },
    { id: "goal.due.approaching", label: "The goal due date is approaching", firesWhen: "N days before due", payloadFields: ["daysLeft"] },
    { id: "goal.pillar.changed", label: "A pillar roll-up status changes", firesWhen: "Pillar roll-up transitions", payloadFields: ["pillar", "status"] },
  ],
  actionIds: ["notify.inapp.send", "notify.email.send", "flow.wait", "webhook.post"],
};
