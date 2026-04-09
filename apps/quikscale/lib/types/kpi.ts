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

export interface KPIRow {
  id: string;
  name: string;
  description?: string | null;
  owner: string;
  owner_user?: OwnerUser;
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
  weeklyValues?: WeeklyValue[];
}
