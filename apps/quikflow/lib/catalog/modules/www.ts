import type { ModuleDef } from "./types";
import { auditFields } from "./audit-fields";

/** WWW (Who / What / When action items) — doc §1.4. Backed by the WWWItem model. */
export const WWW_MODULE: ModuleDef = {
  key: "www",
  label: "WWW",
  recordNoun: "an action item",
  capabilities: { trigger: true, condition: true, action: true },
  binding: { model: "wWWItem", softDelete: true, readable: true },
  fields: [
    { key: "what", label: "What", type: "text", usableIn: ["condition"], column: "what" },
    { key: "owner", label: "Owner (Who)", type: "people", usableIn: ["trigger", "condition", "action"], source: "master:users", column: "who" },
    { key: "when", label: "When (due date)", type: "date", usableIn: ["trigger", "condition"], column: "when" },
    {
      key: "status",
      label: "Status",
      type: "status",
      usableIn: ["trigger", "condition"],
      // Canonical ItemStatus tokens (shared with Priority — status.ts).
      values: ["not-applicable", "not-yet-started", "behind-schedule", "on-track", "completed"],
      column: "status",
    },
    { key: "category", label: "Category", type: "reference", usableIn: ["condition"], source: "master:categories", column: "category" },
    ...auditFields({ createdBy: true, updatedBy: true }),
  ],
  // doc §4.9 — none live yet.
  events: [
    { id: "www.created", label: "A WWW action item is created", firesWhen: "New action item added", payloadFields: ["owner", "when"], live: true },
    { id: "www.assigned", label: "A WWW item is assigned", firesWhen: "Owner set", payloadFields: ["owner"] },
    { id: "www.completed", label: "A WWW item is completed", firesWhen: "Status becomes Completed", payloadFields: ["owner"], live: true },
    { id: "www.overdue", label: "A WWW action item passes its due date", firesWhen: "Past the when-date, still open", payloadFields: ["when", "owner"] },
    { id: "www.due.approaching", label: "N days before a WWW due date", firesWhen: "Reminder offset before due", payloadFields: ["offset"] },
    { id: "www.carried", label: "A WWW item is carried over again", firesWhen: "Item rolls over", payloadFields: ["count"] },
  ],
  actionIds: ["notify.inapp.send", "notify.email.send", "www.complete", "flow.wait", "webhook.post"],
};
