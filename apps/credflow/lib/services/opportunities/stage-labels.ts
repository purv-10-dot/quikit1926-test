/**
 * Stage-label mapping.
 *
 * The Mongo reference enum uses ["Qualification","Proposal","Negotiation","Won","Lost"].
 * The Postgres schema's CrmOpportunityStage enum is the spec-driven richer set
 * (Prospecting added; Won/Lost renamed to ClosedWon/ClosedLost).
 *
 * UI surfaces show the friendly label; the database and API contracts use the
 * canonical enum value. Documented in apps/quikcrm/CLAUDE.md.
 */
import type { QcfOpportunityStage } from "@quikit/database";

export const STAGE_LABEL: Record<QcfOpportunityStage, string> = {
  Prospecting: "Prospecting",
  Qualification: "Qualification",
  Proposal: "Proposal",
  Negotiation: "Negotiation",
  ClosedWon: "Won",
  ClosedLost: "Lost",
};

export const STAGE_ORDER: QcfOpportunityStage[] = [
  "Prospecting",
  "Qualification",
  "Proposal",
  "Negotiation",
  "ClosedWon",
  "ClosedLost",
];

export const TERMINAL_STAGES: ReadonlySet<QcfOpportunityStage> = new Set([
  "ClosedWon",
  "ClosedLost",
]);

/** Server-side default probability per stage. UI suggests; user confirms. */
export const STAGE_DEFAULT_PROBABILITY: Record<QcfOpportunityStage, number> = {
  Prospecting: 10,
  Qualification: 25,
  Proposal: 50,
  Negotiation: 75,
  ClosedWon: 100,
  ClosedLost: 0,
};

/** Close-reason category dropdowns shown by the close-deal modal. */
export const CLOSE_REASON_CATEGORIES = {
  ClosedWon: ["Price", "Features", "Implementation", "Brand", "Other"] as const,
  ClosedLost: [
    "Competitor",
    "Price",
    "No Budget",
    "Lost to Status Quo",
    "Bad Timing",
    "Other",
  ] as const,
} satisfies Record<"ClosedWon" | "ClosedLost", readonly string[]>;
