import type { ModuleDef } from "./types";
import { auditFields } from "./audit-fields";

/**
 * OPSP Review / SWT — doc §1.4. Authorable now (triggers + conditions on inline
 * enums); record reads are deferred until QuikScale exposes a review instance
 * table in the standard envelope (candidate models: OPSPReviewEntry /
 * PerformanceReview). Hence `readable: false` — the builder still offers the
 * status/rating pickers from the inline value lists below.
 */
export const REVIEW_MODULE: ModuleDef = {
  key: "review",
  label: "OPSP Review / SWT",
  recordNoun: "a review",
  capabilities: { trigger: true, condition: true, action: true },
  binding: { readable: false },
  fields: [
    {
      key: "status",
      label: "Status",
      type: "status",
      usableIn: ["trigger", "condition"],
      values: ["pending", "submitted", "completed", "overdue"],
    },
    { key: "reviewer", label: "Reviewer", type: "people", usableIn: ["trigger", "condition", "action"], source: "master:users" },
    { key: "dueDate", label: "Due date", type: "date", usableIn: ["trigger", "condition"] },
    { key: "rating", label: "Rating", type: "dropdown", usableIn: ["condition"], values: ["low", "medium", "high"] },
    ...auditFields({ createdBy: true, updatedBy: true, backed: false }),
  ],
  // doc §4.7 — none live yet.
  events: [
    { id: "review.assigned", label: "A review is assigned", firesWhen: "Reviewer assigned", payloadFields: ["reviewer"] },
    { id: "review.due", label: "The review due date is approaching", firesWhen: "N days before due", payloadFields: ["dueDate"] },
    { id: "review.overdue", label: "A review passes its due date", firesWhen: "Review is past due", payloadFields: ["dueDate", "reviewer"] },
    { id: "review.submitted", label: "A review is submitted", firesWhen: "Reviewer submits", payloadFields: ["reviewer"] },
    { id: "review.completed", label: "A review is completed", firesWhen: "Review closed", payloadFields: ["reviewer"] },
    { id: "review.rating.low", label: "A review rating is Low", firesWhen: "Rating is Low", payloadFields: ["rating"] },
  ],
  actionIds: ["notify.inapp.send", "notify.email.send", "flow.wait"],
};
