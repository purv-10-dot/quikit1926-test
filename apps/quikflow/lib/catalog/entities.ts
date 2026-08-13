/**
 * Entity catalog — the data model, from QuikScale-Workflow-Spec (sheet 4 ·
 * Entities). Triggers emit entities; actions consume them. Used by the builder
 * to expand an event's entity payload (e.g. `kpi`) into selectable condition
 * fields (`trigger.kpi.rag_status`, …).
 */
export interface CatalogEntity {
  name: string;
  /** The event-payload key this entity typically arrives under (e.g. "kpi"). */
  payloadKey: string;
  fields: string[];
}

export const ENTITIES: CatalogEntity[] = [
  { name: "User", payloadKey: "user", fields: ["id", "email", "name", "role", "team_id", "is_active", "job_scorecard", "skills[]", "job_description", "manager_id"] },
  { name: "Org", payloadKey: "org", fields: ["id", "name", "industry", "size_band", "stage", "region", "business_model", "ai_enabled", "fiscal_year", "auto_freeze_days"] },
  { name: "Team", payloadKey: "team", fields: ["id", "name", "manager_id", "member_ids[]", "parent_team_id"] },
  { name: "Kpi", payloadKey: "kpi", fields: ["id", "name", "owner_id", "team_id", "target", "cadence", "type", "unit", "current_value", "rag_status", "progress_pct", "is_ai_suggested", "source_type", "source_id", "linked_to_opsp", "is_locked", "is_archived", "created_at", "runtime_trace_id"] },
  { name: "KpiWeekEntry", payloadKey: "week_entry", fields: ["kpi_id", "week_number", "value", "note", "entered_by", "entered_at", "rag_change"] },
  { name: "Priority", payloadKey: "priority", fields: ["id", "title", "owner_id", "status", "due_date", "description", "linked_kpi_id", "linked_opsp_rock_id", "is_overdue", "is_ai_suggested"] },
  { name: "Www", payloadKey: "www", fields: ["id", "who", "what", "when", "status", "recurring", "created_from_meeting_id"] },
  { name: "Opsp", payloadKey: "opsp", fields: ["id", "quarter_id", "status", "finalized_at", "finalized_by", "sections{}", "brand_promises[]", "critical_number", "theme", "auto_freeze_at"] },
  { name: "OpspBrandPromise", payloadKey: "promise", fields: ["id", "text", "kpi_id", "guarantee", "order_index"] },
  { name: "Meeting", payloadKey: "meeting", fields: ["id", "type", "scheduled_at", "started_at", "completed_at", "attendees[]", "segments{}", "agenda[]", "notes"] },
  { name: "HabitAssessment", payloadKey: "assessment", fields: ["id", "quarter_id", "habit_scores[]", "overall_score", "assessed_by", "assessed_at"] },
  { name: "SwtEntry", payloadKey: "entry", fields: ["id", "category", "type", "impact", "text", "linked_kpi_id", "quarter_id"] },
  { name: "FaceSeat", payloadKey: "seat", fields: ["id", "function_name", "assignee_id", "outcomes[]", "kpis[]", "enthusiastic_rehire", "is_vacant"] },
  { name: "PaceProcess", payloadKey: "process", fields: ["id", "name", "owner_id", "better_kpi", "faster_kpi", "cheaper_kpi", "category"] },
  { name: "Talent", payloadKey: "talent", fields: ["user_id", "classification", "quadrant", "assessed_at", "assessed_by", "auto_signals{}", "potential_score", "performance_score"] },
  { name: "Survey", payloadKey: "survey", fields: ["id", "type", "sent_at", "closed_at", "response_count", "response_rate", "question_ids[]"] },
  { name: "ExecSummary", payloadKey: "exec_summary", fields: ["id", "period", "generated_at", "published_at", "narrative_text", "risks[]", "highlights[]", "trace_id"] },
  { name: "AiToken", payloadKey: "ai_token", fields: ["org_id", "used_this_month", "used_today", "monthly_limit", "daily_limit", "pct_used_month", "is_active"] },
];

/** Map an event-payload key (e.g. "kpi") to its entity, if known. */
export function entityForPayloadKey(key: string): CatalogEntity | undefined {
  return ENTITIES.find((e) => e.payloadKey === key);
}
