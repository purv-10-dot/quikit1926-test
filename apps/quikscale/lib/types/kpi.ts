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
  reverseColor?: boolean;
  // Team KPI per-owner weekly targets: { userId: { weekNumber: value } }
  weeklyOwnerTargets?: Record<string, Record<string, number>> | null;
  // weeklyValues for team KPIs is the aggregated (sum) per-week view built by the API
  weeklyValues?: WeeklyValue[];
  // Phase 2: per-owner raw weekly values for team KPIs. Individual KPIs omit this.
  weeklyOwnerValues?: Record<string, WeeklyValue[]>;
}
