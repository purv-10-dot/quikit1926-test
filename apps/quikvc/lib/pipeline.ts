/**
 * Pipeline stage configuration.
 *
 * QuikVC has 9 canonical stages (architecture brief §6) but the Kanban view
 * groups them into 6 visual columns. Source of truth here so the wizard,
 * pipeline view, deal overview, and timeline use the same labels.
 */

export type StageId =
  | "intake"
  | "onboarding"
  | "doc-collection"
  | "discovery-call"
  | "research"
  | "partner-review"
  | "ic-review"
  | "due-diligence"
  | "final-decision";

export const STAGE_ORDER: StageId[] = [
  "intake",
  "onboarding",
  "doc-collection",
  "discovery-call",
  "research",
  "partner-review",
  "ic-review",
  "due-diligence",
  "final-decision",
];

export const STAGE_LABEL: Record<StageId, string> = {
  intake: "Intake",
  onboarding: "Onboarding",
  "doc-collection": "Document Collection",
  "discovery-call": "Discovery Call",
  research: "Research",
  "partner-review": "Partner Review",
  "ic-review": "IC Review",
  "due-diligence": "Due Diligence",
  "final-decision": "Final Decision",
};

/** Visual Kanban groups — 9 stages collapse into 6 columns. */
export interface KanbanColumn {
  id: string;
  label: string;
  stages: StageId[];
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "inbound",     label: "Inbound",   stages: ["intake", "onboarding"] },
  { id: "screening",   label: "Screening", stages: ["doc-collection", "discovery-call"] },
  { id: "research",    label: "Research",  stages: ["research"] },
  { id: "review",      label: "Review",    stages: ["partner-review", "ic-review"] },
  { id: "diligence",   label: "Diligence", stages: ["due-diligence"] },
  { id: "closed",      label: "Closed",    stages: ["final-decision"] },
];

export function columnForStage(stage: StageId): KanbanColumn | undefined {
  return KANBAN_COLUMNS.find((c) => c.stages.includes(stage));
}

/** Founder-friendly stage label (no internal jargon). */
export const FOUNDER_STAGE_LABEL: Record<StageId, string> = {
  intake: "Submitted",
  onboarding: "Initial review",
  "doc-collection": "Documents requested",
  "discovery-call": "Discovery call scheduled",
  research: "Under review",
  "partner-review": "Partner review",
  "ic-review": "Investment committee",
  "due-diligence": "Due diligence",
  "final-decision": "Decision",
};
