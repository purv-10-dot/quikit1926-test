/**
 * Tenant-configurable lead scoring (0–100).
 * Rules live in CrmOrgWorkspaceSettings.settings.leadScoring.
 */

export const LEAD_SCORING_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_empty",
  "is_not_empty",
  "is_true",
  "is_false",
] as const;

export type LeadScoringOperator = (typeof LEAD_SCORING_OPERATORS)[number];

export interface LeadScoringRule {
  id: string;
  /** Optional label shown in settings UI */
  label?: string;
  enabled: boolean;
  field: string;
  operator: LeadScoringOperator;
  /** string | number | boolean | string[] depending on operator */
  value: string | number | boolean | string[] | null;
  points: number;
}

export interface LeadScoringBehaviorWeights {
  /** Master switch for fit + engagement baselines */
  enabled: boolean;
  /** Max combined points from fit + engagement before rules */
  maxBaselinePoints: number;
}

export interface LeadScoringConfig {
  enabled: boolean;
  autoRecalculate: boolean;
  allowManualOverride: boolean;
  rules: LeadScoringRule[];
  behavior: LeadScoringBehaviorWeights;
}

export interface LeadScoringBreakdown {
  fitPoints: number;
  engagementPoints: number;
  rulePoints: number;
  matchedRules: { id: string; label: string; points: number }[];
  total: number;
}

export interface LeadScoringLeadInput {
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  jobTitle: string | null;
  source: string | null;
  stage: string;
  status: string;
  substatus: string | null;
  industry: string | null;
  country: string | null;
  leadQuality: string | null;
  isStarred: boolean;
  isDisengaged: boolean;
  followupPriority: string | null;
  website: string | null;
  linkedinUrl: string | null;
  dynamicFields: Record<string, unknown> | null;
}

export interface LeadScoringContext {
  activitiesCount: number;
  callsCount: number;
  notesCount: number;
  openTasks: number;
  lastTouchHours: number | null;
  daysSinceCreated: number;
}
