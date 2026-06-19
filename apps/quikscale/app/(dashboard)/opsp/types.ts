/**
 * OPSP shared types — extracted from `page.tsx` in R6 so the page and
 * its sub-components can agree on the form-state shape without a
 * cyclical dependency.
 *
 * Do not add behavior here. Pure types only.
 */

export interface TargetRow {
  category: string;
  projected: string;
  y1: string;
  y2: string;
  y3: string;
  y4: string;
  y5: string;
}

export interface GoalRow {
  category: string;
  projected: string;
  q1: string;
  q2: string;
  q3: string;
  q4: string;
}

export interface ThrustRow {
  desc: string;
  owner: string;
}

export interface KeyInitiativeRow {
  desc: string;
  owner: string;
}

export interface RockRow {
  desc: string;
  owner: string;
}

export interface ActionRow {
  category: string;
  projected: string;
  m1: string;
  m2: string;
  m3: string;
}

export interface KPIAcctRow {
  kpi: string;
  goal: string;
}

export interface QPriorRow {
  priority: string;
  dueDate: string;
}

export interface CritCard {
  title: string;
  bullets: string[];
}

/**
 * OPSP full form data shape — mirror of the inline `FormData` interface in
 * `page.tsx`. Exported so extracted helpers (preview/export, etc.) can
 * receive it without duplicating the type.
 */
export interface OPSPFormData {
  year: number;
  quarter: string;
  targetYears: number;
  status: string;
  employees: string[];
  customers: string[];
  shareholders: string[];
  coreValues: string;
  purpose: string;
  actions: string[];
  profitPerX: string;
  bhag: string;
  targetRows: TargetRow[];
  sandbox: string;
  keyThrusts: ThrustRow[];
  brandPromiseKPIs: string;
  brandPromise: string;
  goalRows: GoalRow[];
  keyInitiatives: KeyInitiativeRow[];
  criticalNumGoals: CritCard;
  balancingCritNumGoals: CritCard;
  processItems: string[];
  weaknesses: string[];
  makeBuy: string[];
  sell: string[];
  recordKeeping: string[];
  actionsQtr: ActionRow[];
  rocks: RockRow[];
  criticalNumProcess: CritCard;
  balancingCritNumProcess: CritCard;
  theme: string;
  scoreboardDesign: string;
  celebration: string;
  reward: string;
  kpiAccountability: KPIAcctRow[];
  quarterlyPriorities: QPriorRow[];
  criticalNumAcct: CritCard;
  balancingCritNumAcct: CritCard;
  trends: string[];
}
