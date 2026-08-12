import type { ModuleDef } from "./types";
import { auditFields } from "./audit-fields";

/**
 * OPSP — doc §1.3. Per-user, per-quarter document with a lifecycle + Finalize
 * step. Owner is the `userId` the plan is authored for. Auto-finalize / review
 * dates are orchestrated by QuikScale and surfaced on time events; they carry no
 * stored scalar column here, so they are trigger/condition-authorable only.
 */
export const OPSP_MODULE: ModuleDef = {
  key: "opsp",
  label: "OPSP",
  recordNoun: "an OPSP",
  capabilities: { trigger: true, condition: true, action: true },
  binding: { model: "oPSPData", softDelete: false, readable: true },
  fields: [
    {
      key: "status",
      label: "Status",
      type: "status",
      usableIn: ["trigger", "condition"],
      // Real OPSPData lifecycle tokens (draft → finalized → reviewed).
      values: ["draft", "active", "finalized", "reviewed"],
      column: "status",
    },
    { key: "quarter", label: "Quarter", type: "reference", usableIn: ["trigger", "condition"], source: "master:quarters", column: "quarter" },
    { key: "owner", label: "Owner (editing for)", type: "people", usableIn: ["trigger", "condition", "action"], source: "master:users", column: "userId" },
    { key: "autoFinalizeDate", label: "Auto-finalize date", type: "date", usableIn: ["trigger", "condition"], derived: true },
    { key: "reviewDueDate", label: "Review due date", type: "date", usableIn: ["trigger", "condition"], derived: true },
    ...auditFields({ createdBy: true, updatedBy: true }),
  ],
  // Real lifecycle draft → finalized → reviewed (QuikScale emits stage.changed /
  // finalized / auto_finalized / reviewed). The two *.due events need the
  // scheduler and stay planned.
  events: [
    { id: "opsp.stage.changed", label: "The OPSP stage changes", firesWhen: "Status transition (draft → finalized → reviewed)", payloadFields: ["status", "before", "after"], live: true },
    { id: "opsp.finalized", label: "An OPSP is finalized", firesWhen: "Status becomes finalized (manual or auto)", payloadFields: ["owner", "quarter"], live: true },
    { id: "opsp.auto_finalized", label: "An OPSP is auto-finalized", firesWhen: "Auto-finalize date hit", payloadFields: ["owner", "quarter"], live: true },
    { id: "opsp.reviewed", label: "An OPSP review is submitted", firesWhen: "Status becomes reviewed", payloadFields: ["owner", "quarter"], live: true },
    { id: "opsp.finalize.due", label: "Auto-finalize date approaching", firesWhen: "N days before auto-finalize", payloadFields: ["autoFinalizeDate", "daysLeft"] },
    { id: "opsp.review.due", label: "The review due date is approaching", firesWhen: "N days before review due", payloadFields: ["reviewDueDate", "daysLeft"] },
  ],
  actionIds: [
    "notify.inapp.send",
    "notify.email.send",
    "opsp.finalize",
    "opsp.review.mark",
    "flow.wait",
    "webhook.post",
  ],
};
