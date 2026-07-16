/**
 * Trigger catalog — every event QuikScale can fire, from QuikScale-Workflow-Spec
 * (sheet 1 · Triggers). Grouped App → Module → Event for the builder's cascading
 * picker.
 *
 * `live` marks events QuikScale ACTUALLY emits today (only `kpi.below_target`,
 * via apps/quikscale/lib/services/workflowEvents.ts). Every other event is
 * authorable now but needs a QuikScale emitter before it will fire — the builder
 * shows a "Planned" badge so users aren't surprised when a Planned workflow
 * doesn't run. Other apps are stubbed ("coming soon"); v1 integrates QuikScale.
 */
export type Pillar = "Global" | "Execution" | "Strategy" | "People" | "AI" | "Admin";
export type EventScope = "Org" | "User" | "Workflow";

export interface CatalogEvent {
  id: string;
  label: string;
  module: string;
  pillar: Pillar;
  firesWhen: string;
  payloadFields: string[];
  scope: EventScope;
  /** QuikScale emits this today (end-to-end). Absent/false ⇒ authorable, not yet emitted. */
  live?: boolean;
}

export interface CatalogApp {
  slug: string;
  name: string;
  comingSoon?: boolean;
  events: CatalogEvent[];
}

const QUIKSCALE_EVENTS: CatalogEvent[] = [
  // ── Global · Time ────────────────────────────────────────────────────────
  { id: "time.week.started", label: "A new week starts", module: "Time", pillar: "Global", firesWhen: "Monday 00:00 org timezone", payloadFields: ["week_number", "quarter_id"], scope: "Org" },
  { id: "time.week.ended", label: "A week ends", module: "Time", pillar: "Global", firesWhen: "Sunday 23:59", payloadFields: ["week_number"], scope: "Org" },
  { id: "time.quarter.started", label: "A new quarter starts", module: "Time", pillar: "Global", firesWhen: "First day of quarter", payloadFields: ["quarter_id", "fiscal_year"], scope: "Org" },
  { id: "time.quarter.ended", label: "A quarter ends", module: "Time", pillar: "Global", firesWhen: "Last day of quarter", payloadFields: ["quarter_id"], scope: "Org" },
  { id: "time.month.started", label: "A new month starts", module: "Time", pillar: "Global", firesWhen: "1st of month 00:00", payloadFields: ["month", "year"], scope: "Org" },
  { id: "time.schedule.fired", label: "A custom schedule fires", module: "Time", pillar: "Global", firesWhen: "Custom cron on the workflow", payloadFields: ["scheduled_at"], scope: "Workflow" },

  // ── Execution · KPI ──────────────────────────────────────────────────────
  { id: "kpi.below_target", label: "A KPI weekly value is below target (RED)", module: "KPI", pillar: "Execution", firesWhen: "A saved weekly value lands in the RED bucket", payloadFields: ["kpiId", "name", "value", "target", "gapPct", "ownerId", "ownerIds", "teamId", "quarter", "year", "weekNumber", "previousValue"], scope: "Org", live: true },
  { id: "kpi.created", label: "A KPI is created", module: "KPI", pillar: "Execution", firesWhen: "New KPI persisted", payloadFields: ["kpi", "created_by"], scope: "Org" },
  { id: "kpi.updated", label: "A KPI is updated", module: "KPI", pillar: "Execution", firesWhen: "Any field changes", payloadFields: ["kpi", "diff", "updated_by"], scope: "Org" },
  { id: "kpi.deleted", label: "A KPI is deleted", module: "KPI", pillar: "Execution", firesWhen: "KPI deleted", payloadFields: ["kpi_id", "deleted_by"], scope: "Org" },
  { id: "kpi.value.entered", label: "A weekly KPI value is entered", module: "KPI", pillar: "Execution", firesWhen: "Weekly value entered", payloadFields: ["kpi", "week_entry", "previous_value"], scope: "User" },
  { id: "kpi.rag.changed", label: "A KPI's RAG status changes", module: "KPI", pillar: "Execution", firesWhen: "RAG status transitions", payloadFields: ["kpi", "from_rag", "to_rag"], scope: "Org" },
  { id: "kpi.target.reached", label: "A KPI reaches its target", module: "KPI", pillar: "Execution", firesWhen: "Cumulative ≥ target", payloadFields: ["kpi", "achieved_at"], scope: "Org" },
  { id: "kpi.stale", label: "A KPI goes stale (no update)", module: "KPI", pillar: "Execution", firesWhen: "No update > N days", payloadFields: ["kpi", "days_since_update"], scope: "Org" },
  { id: "kpi.owner.changed", label: "A KPI owner is reassigned", module: "KPI", pillar: "Execution", firesWhen: "Owner reassigned", payloadFields: ["kpi", "from_owner_id", "to_owner_id"], scope: "Org" },
  { id: "kpi.milestone.crossed", label: "A KPI crosses a milestone", module: "KPI", pillar: "Execution", firesWhen: "25/50/75/100% milestone", payloadFields: ["kpi", "milestone_pct"], scope: "Org" },
  { id: "kpi.ai.suggested", label: "AI suggests a KPI", module: "KPI", pillar: "Execution", firesWhen: "AI produced a candidate", payloadFields: ["suggestion", "sources"], scope: "User" },
  { id: "kpi.ai.accepted", label: "A user accepts an AI KPI", module: "KPI", pillar: "Execution", firesWhen: "User accepted AI candidate", payloadFields: ["kpi", "decision", "ai_confidence", "prompt"], scope: "User" },

  // ── Execution · Priority ─────────────────────────────────────────────────
  { id: "priority.created", label: "A priority is created", module: "Priority", pillar: "Execution", firesWhen: "New Priority", payloadFields: ["priority"], scope: "Org" },
  { id: "priority.status.changed", label: "A priority's status changes", module: "Priority", pillar: "Execution", firesWhen: "Status transition", payloadFields: ["priority", "from_status", "to_status"], scope: "Org" },
  { id: "priority.completed", label: "A priority is completed", module: "Priority", pillar: "Execution", firesWhen: "Marked Done", payloadFields: ["priority", "completed_by"], scope: "Org" },
  { id: "priority.overdue", label: "A priority becomes overdue", module: "Priority", pillar: "Execution", firesWhen: "Past due, still open", payloadFields: ["priority", "days_overdue"], scope: "Org" },
  { id: "priority.due.soon", label: "A priority is due soon", module: "Priority", pillar: "Execution", firesWhen: "Due within N days", payloadFields: ["priority", "days_until_due"], scope: "Org" },

  // ── Execution · WWW ──────────────────────────────────────────────────────
  { id: "www.created", label: "A WWW item is added", module: "WWW", pillar: "Execution", firesWhen: "Item added", payloadFields: ["www"], scope: "Org" },
  { id: "www.completed", label: "A WWW item is completed", module: "WWW", pillar: "Execution", firesWhen: "Marked done", payloadFields: ["www", "completed_by"], scope: "Org" },
  { id: "www.overdue", label: "A WWW item is overdue", module: "WWW", pillar: "Execution", firesWhen: "Past when-date", payloadFields: ["www", "days_overdue"], scope: "Org" },
  { id: "www.bulk.imported", label: "WWW items are bulk-imported", module: "WWW", pillar: "Execution", firesWhen: "AI meeting-analysis batch", payloadFields: ["items[]", "meeting_id"], scope: "Org" },

  // ── Execution · Meeting ──────────────────────────────────────────────────
  { id: "meeting.scheduled", label: "A meeting is scheduled", module: "Meeting", pillar: "Execution", firesWhen: "Meeting created", payloadFields: ["meeting"], scope: "Org" },
  { id: "meeting.started", label: "A meeting starts", module: "Meeting", pillar: "Execution", firesWhen: "Attendee joins", payloadFields: ["meeting", "started_by"], scope: "Org" },
  { id: "meeting.completed", label: "A meeting is completed", module: "Meeting", pillar: "Execution", firesWhen: "Marked done", payloadFields: ["meeting", "duration_minutes"], scope: "Org" },
  { id: "meeting.cancelled", label: "A meeting is cancelled", module: "Meeting", pillar: "Execution", firesWhen: "Cancelled", payloadFields: ["meeting", "cancelled_by"], scope: "Org" },
  { id: "meeting.segment.completed", label: "A meeting segment completes", module: "Meeting", pillar: "Execution", firesWhen: "Individual segment done", payloadFields: ["meeting_id", "segment_name"], scope: "Org" },

  // ── Strategy · OPSP ──────────────────────────────────────────────────────
  { id: "opsp.created", label: "An OPSP is created", module: "OPSP", pillar: "Strategy", firesWhen: "New OPSP", payloadFields: ["opsp"], scope: "Org" },
  { id: "opsp.section.updated", label: "An OPSP section is updated", module: "OPSP", pillar: "Strategy", firesWhen: "Section changes", payloadFields: ["opsp_id", "section_name", "diff", "updated_by"], scope: "Org" },
  { id: "opsp.finalized", label: "An OPSP is finalized", module: "OPSP", pillar: "Strategy", firesWhen: "Admin finalizes", payloadFields: ["opsp", "finalized_by"], scope: "Org" },
  { id: "opsp.reviewed", label: "An OPSP is reviewed", module: "OPSP", pillar: "Strategy", firesWhen: "Review completed", payloadFields: ["opsp", "reviewed_by"], scope: "Org" },
  { id: "opsp.unlocked", label: "An OPSP is unlocked", module: "OPSP", pillar: "Strategy", firesWhen: "Super Admin override", payloadFields: ["opsp", "unlocked_by", "reason"], scope: "Org" },
  { id: "opsp.autofreeze.reached", label: "An OPSP auto-freeze date is hit", module: "OPSP", pillar: "Strategy", firesWhen: "Auto-freeze date hit", payloadFields: ["opsp", "freeze_date"], scope: "Org" },
  { id: "opsp.ya.updated", label: "A member updates their YA", module: "OPSP", pillar: "Strategy", firesWhen: "Member updates their YA", payloadFields: ["opsp_id", "user_id", "ya_row"], scope: "User" },
  { id: "opsp.ya.pushed_to_kpi", label: "A YA row is pushed to a KPI", module: "OPSP", pillar: "Strategy", firesWhen: "YA row bridged to KPI", payloadFields: ["ya_row", "new_kpi_id"], scope: "User" },
  { id: "opsp.brand_promise.updated", label: "A Brand Promise changes", module: "OPSP", pillar: "Strategy", firesWhen: "Brand Promise changed", payloadFields: ["promise", "diff"], scope: "Org" },

  // ── Strategy · 7 Strata ──────────────────────────────────────────────────
  { id: "strata.answered", label: "A strata layer is answered", module: "7 Strata", pillar: "Strategy", firesWhen: "Layer answered", payloadFields: ["stratum_number", "answer"], scope: "Org" },
  { id: "strata.chain.checked", label: "A strata chain-coherence audit runs", module: "7 Strata", pillar: "Strategy", firesWhen: "Chain-coherence audit", payloadFields: ["coherence_score", "weak_links[]"], scope: "Org" },

  // ── Strategy · SWT ───────────────────────────────────────────────────────
  { id: "swt.entry.added", label: "A SWT entry is added", module: "SWT", pillar: "Strategy", firesWhen: "New SWT entry", payloadFields: ["entry"], scope: "Org" },
  { id: "swt.entry.updated", label: "A SWT entry is updated", module: "SWT", pillar: "Strategy", firesWhen: "Entry updated", payloadFields: ["entry", "diff"], scope: "Org" },
  { id: "swt.trend.flagged", label: "A SWT trend is flagged", module: "SWT", pillar: "Strategy", firesWhen: "Trend flagged", payloadFields: ["entry", "trend_type"], scope: "Org" },

  // ── Strategy · Habits ────────────────────────────────────────────────────
  { id: "habits.assessed", label: "A habit assessment runs", module: "Habits", pillar: "Strategy", firesWhen: "Habit assessment run", payloadFields: ["assessment", "overall_score"], scope: "Org" },

  // ── People · FACe ────────────────────────────────────────────────────────
  { id: "face.seat.assigned", label: "A person is put in a seat", module: "FACe", pillar: "People", firesWhen: "Person put in seat", payloadFields: ["seat", "assignee"], scope: "Org" },
  { id: "face.seat.vacated", label: "A seat is vacated", module: "FACe", pillar: "People", firesWhen: "Seat cleared", payloadFields: ["seat"], scope: "Org" },
  { id: "face.seat.multiple_occupants", label: "A seat has multiple occupants", module: "FACe", pillar: "People", firesWhen: "> 1 person in seat", payloadFields: ["seat", "occupants[]"], scope: "Org" },

  // ── People · PACe ────────────────────────────────────────────────────────
  { id: "pace.process.created", label: "A process is created", module: "PACe", pillar: "People", firesWhen: "New process", payloadFields: ["process"], scope: "Org" },
  { id: "pace.process.missing_bfc", label: "A process is missing Better/Faster/Cheaper", module: "PACe", pillar: "People", firesWhen: "Better/Faster/Cheaper gap", payloadFields: ["process", "missing[]"], scope: "Org" },

  // ── People · Talent ──────────────────────────────────────────────────────
  { id: "talent.classified", label: "A talent classification changes", module: "Talent", pillar: "People", firesWhen: "A/B/C set or changed", payloadFields: ["user_id", "from_class", "to_class"], scope: "Org" },
  { id: "talent.autosignal.received", label: "A talent auto-signal arrives", module: "Talent", pillar: "People", firesWhen: "Signal arrived", payloadFields: ["user_id", "signal_type", "value"], scope: "Org" },

  // ── People · Survey ──────────────────────────────────────────────────────
  { id: "survey.sent", label: "A survey is dispatched", module: "Survey", pillar: "People", firesWhen: "Survey dispatched", payloadFields: ["survey", "recipients[]"], scope: "Org" },
  { id: "survey.response.received", label: "A survey response is received", module: "Survey", pillar: "People", firesWhen: "New response", payloadFields: ["survey_id", "response"], scope: "Org" },
  { id: "survey.closed", label: "A survey closes", module: "Survey", pillar: "People", firesWhen: "Survey ended", payloadFields: ["survey", "final_response_rate"], scope: "Org" },

  // ── AI · Runtime ─────────────────────────────────────────────────────────
  { id: "ai.suggestion.returned", label: "An AI suggestion is returned", module: "AI Runtime", pillar: "AI", firesWhen: "Any AI response", payloadFields: ["use_case", "response", "trace_id"], scope: "User" },
  { id: "ai.suggestion.decided", label: "A user decides on an AI suggestion", module: "AI Runtime", pillar: "AI", firesWhen: "User Accept/Edit/Reject/Defer", payloadFields: ["suggestion_id", "decision", "edit_diff"], scope: "User" },
  { id: "ai.tokens.threshold_crossed", label: "AI token usage crosses a threshold", module: "AI Runtime", pillar: "AI", firesWhen: "80% / 95% / 100%", payloadFields: ["org_id", "threshold_pct"], scope: "Org" },
  { id: "ai.fallback.fired", label: "An AI fallback fires", module: "AI Runtime", pillar: "AI", firesWhen: "withFallback ran", payloadFields: ["feature", "reason", "trace_id"], scope: "User" },

  // ── Admin · User Mgmt ────────────────────────────────────────────────────
  { id: "user.invited", label: "A user is invited", module: "User Mgmt", pillar: "Admin", firesWhen: "Invite sent", payloadFields: ["email", "invited_by", "role"], scope: "Org" },
  { id: "user.activated", label: "A user activates (first login)", module: "User Mgmt", pillar: "Admin", firesWhen: "First login", payloadFields: ["user"], scope: "Org" },
  { id: "user.deactivated", label: "A user is deactivated", module: "User Mgmt", pillar: "Admin", firesWhen: "Account disabled", payloadFields: ["user", "deactivated_by"], scope: "Org" },
  { id: "user.role.changed", label: "A user's role changes", module: "User Mgmt", pillar: "Admin", firesWhen: "Role reassigned", payloadFields: ["user", "from_role", "to_role"], scope: "Org" },

  // ── Admin · Permissions ──────────────────────────────────────────────────
  { id: "permission.granted", label: "A permission is granted", module: "Permissions", pillar: "Admin", firesWhen: "Extra permission added", payloadFields: ["user", "permission", "granted_by"], scope: "Org" },

  // ── Admin · Settings ─────────────────────────────────────────────────────
  { id: "setting.changed", label: "A company setting changes", module: "Settings", pillar: "Admin", firesWhen: "Any Company Setting", payloadFields: ["setting_key", "from", "to", "changed_by"], scope: "Org" },
];

export const TRIGGER_CATALOG: CatalogApp[] = [
  { slug: "quikscale", name: "QuikScale", events: QUIKSCALE_EVENTS },
  { slug: "quikcrm", name: "QuikCRM", comingSoon: true, events: [] },
  { slug: "quikhrms", name: "QuikHRMS", comingSoon: true, events: [] },
  { slug: "quikinfra", name: "QuikInfra", comingSoon: true, events: [] },
  { slug: "quiktrack", name: "QuikTrack", comingSoon: true, events: [] },
];
