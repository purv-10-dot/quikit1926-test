import type { ModuleDef } from "./types";
import { auditFields } from "./audit-fields";

/**
 * KPI / Individual KPI — the flagship module (doc §1.1). RAG status and gap %
 * are derived by QuikScale (achieved vs goal) and arrive on the event payload;
 * QuikFlow never recomputes them. `kpi.below_target` is the one event emitted
 * end-to-end today (apps/quikscale/lib/services/workflowEvents.ts).
 */
export const KPI_MODULE: ModuleDef = {
  key: "kpi",
  label: "KPI / Individual KPI",
  recordNoun: "a KPI",
  capabilities: { trigger: true, condition: true, action: true },
  binding: { model: "kPI", softDelete: true, readable: true },
  fields: [
    { key: "name", label: "KPI Name", type: "text", usableIn: ["condition"], column: "name" },
    {
      key: "status",
      label: "Health Status (Red / Yellow / Green)",
      type: "status",
      usableIn: ["trigger", "condition", "action"],
      values: ["red", "yellow", "green"],
      derived: true,
      column: "healthStatus",
      description: "Traffic-light health state (Red / Yellow / Green) derived by QuikScale from achieved vs goal.",
    },
    { key: "owner", label: "Owner", type: "people", usableIn: ["trigger", "condition", "action"], source: "master:users", column: "owner" },
    { key: "measurementUnit", label: "Measurement Unit", type: "reference", usableIn: ["condition"], source: "master:units", column: "measurementUnit" },
    { key: "target", label: "Target Value", type: "number", usableIn: ["condition"], column: "target" },
    { key: "quarterlyGoal", label: "Quarterly Goal", type: "number", usableIn: ["condition"], column: "quarterlyGoal" },
    { key: "qtdGoal", label: "QTD Goal", type: "number", usableIn: ["condition"], column: "qtdGoal" },
    { key: "qtdAchieved", label: "QTD Achieved", type: "number", usableIn: ["trigger", "condition"], column: "qtdAchieved" },
    { key: "progressPercent", label: "Progress %", type: "number", usableIn: ["trigger", "condition"], column: "progressPercent" },
    { key: "gapPct", label: "Gap %", type: "number", usableIn: ["trigger", "condition"], derived: true, description: "Percent below/above target — computed by QuikScale." },
    { key: "category", label: "Category", type: "reference", usableIn: ["condition"], source: "master:categories", description: "KPI classification (master data)." },
    { key: "period", label: "Period", type: "dropdown", usableIn: ["trigger", "condition"], values: ["weekly", "monthly", "quarterly", "annual"], column: "frequency" },
    { key: "quarter", label: "Quarter", type: "reference", usableIn: ["trigger", "condition"], source: "master:quarters", column: "quarter" },
    { key: "team", label: "Team", type: "reference", usableIn: ["trigger", "condition"], source: "master:teams", column: "teamId" },
    ...auditFields({ createdBy: true, updatedBy: true }),
  ],
  // doc §4.1 — the 10 event families applied to Individual KPI. Only
  // kpi.below_target + kpi.created are `live` (QuikScale emits them today); the
  // rest are authorable and badged "planned" until an emitter is added.
  events: [
    { id: "kpi.created", label: "A KPI is created", firesWhen: "New KPI persisted", payloadFields: ["name", "owner", "team", "quarter", "year"], live: true },
    { id: "kpi.reading.logged", label: "A new weekly reading is logged", firesWhen: "A weekly value is entered", payloadFields: ["value", "weekNumber", "owner"], live: true },
    { id: "kpi.value.updated", label: "A KPI value is updated", firesWhen: "An existing reading changes", payloadFields: ["before", "after", "owner"] },
    { id: "kpi.status.changed", label: "A KPI's health status changes (Red / Yellow / Green)", firesWhen: "Health status transitions (colour bucket changes)", payloadFields: ["status", "before", "after", "owner"], live: true },
    { id: "kpi.rag.changed_to", label: "Health status changes to a chosen colour", firesWhen: "Health status becomes Red / Yellow / Green", payloadFields: ["status", "owner"] },
    { id: "kpi.below_target", label: "A KPI weekly value is below target (RED)", firesWhen: "A saved weekly value lands in the RED bucket", payloadFields: ["name", "value", "target", "gapPct", "owner", "team", "quarter", "year", "weekNumber", "previousValue"], live: true },
    { id: "kpi.streak", label: "A KPI stays in a state for N periods", firesWhen: "Stays in a state N periods (e.g. Red for 3 weeks)", payloadFields: ["status", "streak"] },
    { id: "kpi.threshold.crossed", label: "Gap % / value crosses a watched number", firesWhen: "A watched number is crossed", payloadFields: ["gapPct", "value"] },
    { id: "kpi.pct_of_target", label: "Achievement crosses X% of target", firesWhen: "e.g. drops below 70% of target", payloadFields: ["progressPercent", "target", "qtdAchieved"] },
    { id: "kpi.target.reached", label: "A KPI reaches / exceeds target", firesWhen: "Cumulative ≥ target", payloadFields: ["qtdAchieved", "target"] },
    { id: "kpi.declining", label: "A KPI declines N readings in a row", firesWhen: "Downward trend of N readings", payloadFields: ["streak"] },
    { id: "kpi.stale", label: "A KPI is not updated for N periods", firesWhen: "No update for N periods", payloadFields: ["periods", "owner"] },
    { id: "kpi.reading.missing", label: "This week's reading is missing", firesWhen: "No value entered this week", payloadFields: ["weekNumber", "owner"] },
    { id: "kpi.owner.changed", label: "A KPI is assigned / reassigned", firesWhen: "Owner set or changed", payloadFields: ["owner", "prevOwner"] },
    { id: "kpi.target.changed", label: "The target is changed", firesWhen: "Target value edited", payloadFields: ["before", "after"] },
    { id: "kpi.comment.posted", label: "A comment is posted on a KPI", firesWhen: "A note / comment is added", payloadFields: ["author", "text"] },
    { id: "kpi.manual.run", label: "A user runs it manually (test / one-off)", firesWhen: "Run now on this module", payloadFields: ["actor"] },
  ],
  actionIds: [
    "notify.inapp.send",
    "notify.email.send",
    "notify.slack.send",
    "notify.teams.send",
    "kpi.create",
    "kpi.update",
    "kpi.value.enter",
    "kpi.archive",
    "kpi.rag.set",
    "priority.create",
    "www.create",
    "flow.wait",
    "webhook.post",
  ],
};
