export type { KPIResponse, WeeklyValueResponse, KPINoteResponse, KPILogResponse } from "@/lib/services/kpiService";

export interface OwnerUser {
  id: string;
  firstName: string;
  lastName: string;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface WeeklyValue {
  weekNumber: number;
  value?: number | null;
  notes?: string | null;
}

export interface TeamInfo {
  id: string;
  name: string;
  color?: string | null;
  headId?: string | null;
  head?: OwnerUser | null;
}

export interface KPIRow {
  id: string;
  name: string;
  description?: string | null;
  kpiLevel?: "individual" | "team";
  owner: string | null;
  owner_user?: OwnerUser | null;
  // Team KPI multi-owner fields (enriched by API for GET)
  ownerIds?: string[];
  ownerContributions?: Record<string, number> | null;
  owners?: OwnerUser[];
  team?: TeamInfo | null;
  teamId?: string | null;
  parentKPIId?: string | null;
  /** Populated by /api/kpi list when parentKPIId is set — used by the
   *  Individual table to surface a "Linked" badge pointing at the Team KPI. */
  parentKPI?: { id: string; name: string; kpiLevel: string | null } | null;
  quarter: string;
  year: number;
  measurementUnit: string;
  target?: number | null;
  quarterlyGoal?: number | null;
  qtdGoal?: number | null;
  qtdAchieved?: number | null;
  progressPercent: number;
  lastNotes?: string | null;
  lastNotesAt?: string | null;
  status?: string;
  divisionType?: string | null;
  weeklyTargets?: Record<string, number> | null;
  currency?: string | null;
  targetScale?: string | null;
  /** Display label for Number KPIs (from Unit Master), e.g. "Leads". */
  unit?: string | null;
  /** When true (Currency + targetScale), values display/accept in the scale unit. */
  scaledDisplay?: boolean;
  reverseColor?: boolean;
  frequency?: string;
  /** Leading (predictive input) vs Lagging (outcome) classification; "NA" = unset. */
  kpiType?: string;
  /** True when created via the OPSP "Export → Create KPIs" flow (display-only). */
  importedFromOpsp?: boolean;
  // Team KPI per-owner weekly targets: { userId: { weekNumber: value } }
  weeklyOwnerTargets?: Record<string, Record<string, number>> | null;
  // weeklyValues for team KPIs is the aggregated (sum) per-week view built by the API
  weeklyValues?: WeeklyValue[];
  // Phase 2: per-owner raw weekly values for team KPIs. Individual KPIs omit this.
  weeklyOwnerValues?: Record<string, WeeklyValue[]>;
  // Audit columns — populated by GET /api/kpi via `decorateAudit` so the
  // KPI table can render Created By / Updated By / Created Date / Updated
  // Date columns without an extra round-trip. updatedBy/updatedByName/
  // updatedByInitials are null on a brand-new row that has never been
  // edited.
  createdAt?: string;
  updatedAt?: string;
  // `createdBy` matches the Prisma column (NOT NULL). `updatedBy` is
  // nullable — Prisma allows null for rows that haven't been edited.
  createdBy?: string;
  updatedBy?: string | null;
  createdByName?: string;
  createdByInitials?: string;
  updatedByName?: string | null;
  updatedByInitials?: string | null;
}
