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
