/**
 * v1 connector catalog for the builder. Proposed QuikScale event/action keys
 * per QuikScale-Workflow-Spec.xlsx + QuikFlow-PRD §9 — confirm with the
 * QuikScale team during connector integration. Other apps are stubbed
 * ("coming soon") for v1, which integrates QuikScale only.
 */
export interface CatalogApp {
  slug: string;
  name: string;
  comingSoon?: boolean;
  events: { id: string; label: string }[];
}

export const TRIGGER_CATALOG: CatalogApp[] = [
  {
    slug: "quikscale",
    name: "QuikScale",
    events: [
      { id: "kpi.below_target", label: "A KPI falls below target" },
      { id: "kpi.rag.changed", label: "A KPI's RAG status changes" },
      { id: "kpi.stale", label: "A KPI goes stale (no update)" },
      { id: "priority.at_risk", label: "A priority is flagged at-risk" },
      { id: "priority.overdue", label: "A priority becomes overdue" },
      { id: "www.overdue", label: "A WWW item is overdue" },
      { id: "opsp.finalized", label: "An OPSP is finalized" },
      { id: "time.week.started", label: "A new week starts (schedule)" },
      { id: "time.quarter.ended", label: "A quarter ends (schedule)" },
    ],
  },
  { slug: "quikcrm", name: "QuikCRM", comingSoon: true, events: [] },
  { slug: "quikhrms", name: "QuikHRMS", comingSoon: true, events: [] },
  { slug: "quikinfra", name: "QuikInfra", comingSoon: true, events: [] },
  { slug: "quiktrack", name: "QuikTrack", comingSoon: true, events: [] },
];

export const ACTION_CATALOG: { id: string; label: string }[] = [
  { id: "notify_owner", label: "Notify the owner (in-app)" },
  { id: "notify.email.send", label: "Send an email (Outlook / Gmail)" },
  { id: "notify.slack.send", label: "Post to Slack" },
  { id: "notify.teams.send", label: "Post to Microsoft Teams" },
  { id: "create_priority", label: "Create a QuikScale priority" },
  { id: "kpi.update", label: "Update a KPI" },
];

export const STEP_KINDS: { kind: string; label: string; hint: string }[] = [
  { kind: "action", label: "Action", hint: "do something" },
  { kind: "condition", label: "Condition", hint: "filter — continue or stop" },
  { kind: "if_else", label: "If / Else branch", hint: "two paths" },
  { kind: "wait", label: "Wait / delay", hint: "pause" },
  { kind: "loop", label: "Loop (for each)", hint: "repeat over a list" },
  { kind: "approval", label: "Request approval", hint: "ask a person" },
];
