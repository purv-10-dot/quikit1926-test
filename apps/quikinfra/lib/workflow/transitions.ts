/**
 * Status Transition Validator
 *
 * Central source of truth for "can this entity go from state X to state Y?".
 * Used by every service layer before mutating a status field.
 *
 * Transition maps are intentionally explicit — no `any → any` shortcuts —
 * because silently allowing an illegal transition is how production ERP
 * data gets corrupted in ways that are hard to reverse.
 *
 * Reuses canonical enums from src/lib/purchase/enums.ts so there's one
 * source of truth between the service layer and the type system.
 */

import {
  MRStatus,
  IndentStatus,
  POStatus,
  GRNStatus,
  MR_TRANSITIONS,
  INDENT_TRANSITIONS,
  PO_TRANSITIONS,
} from "@/lib/purchase/enums";

// ─── Additional transition maps for modules not in purchase/enums.ts ─

/** Material Issue statuses. Mirrors purchase GRN flow. */
export const ISSUE_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["approved", "rejected", "cancelled"],
  approved: ["posted", "reversed"],
  posted: ["reversed"],
  rejected: ["draft"],
  cancelled: [],
  reversed: [],
};

export const GRN_TRANSITIONS: Record<string, string[]> = {
  [GRNStatus.DRAFT]: [GRNStatus.PENDING_APPROVAL, "cancelled"],
  [GRNStatus.PENDING_APPROVAL]: [GRNStatus.APPROVED, GRNStatus.REJECTED],
  [GRNStatus.APPROVED]: [GRNStatus.ACCOUNTS_EXPORTED, "reversed"],
  [GRNStatus.ACCOUNTS_EXPORTED]: [],
  [GRNStatus.REJECTED]: [GRNStatus.DRAFT],
};

export const DPR_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["approved", "rejected", "returned"],
  returned: ["draft", "submitted"],
  approved: ["reversed"],
  rejected: ["draft"],
  reversed: [],
  cancelled: [],
};

export const RAB_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["approved", "rejected", "returned"],
  returned: ["draft", "submitted"],
  approved: ["paid", "reversed"],
  paid: [],
  rejected: ["draft"],
  reversed: [],
  cancelled: [],
};

// ─── Core validator ─────────────────────────────────────────────────

export type TransitionMap = Record<string, string[]>;

export const TRANSITION_MAPS: Record<string, TransitionMap> = {
  mr: MR_TRANSITIONS,
  indent: INDENT_TRANSITIONS,
  po: PO_TRANSITIONS,
  grn: GRN_TRANSITIONS,
  issue: ISSUE_TRANSITIONS,
  dpr: DPR_TRANSITIONS,
  rab: RAB_TRANSITIONS,
};

export class TransitionError extends Error {
  code = "INVALID_TRANSITION";
  httpStatus = 400;
  constructor(public entity: string, public from: string, public to: string) {
    super(
      `Illegal ${entity} transition: ${from} → ${to}. ` +
        `Allowed: ${(TRANSITION_MAPS[entity]?.[from] ?? []).join(", ") || "(terminal state)"}`
    );
    this.name = "TransitionError";
  }
}

/**
 * Throws TransitionError if `from → to` is not allowed for `entity`.
 * Safe to call inside a Prisma transaction — no side effects.
 */
export function assertTransition(
  entity: keyof typeof TRANSITION_MAPS,
  from: string,
  to: string
): void {
  const map = TRANSITION_MAPS[entity];
  if (!map) throw new TransitionError(entity as string, from, to);
  const allowed = map[from];
  if (!allowed || !allowed.includes(to)) {
    throw new TransitionError(entity as string, from, to);
  }
}

/** Non-throwing variant for conditional logic. */
export function canTransition(
  entity: keyof typeof TRANSITION_MAPS,
  from: string,
  to: string
): boolean {
  const map = TRANSITION_MAPS[entity];
  return !!map?.[from]?.includes(to);
}
