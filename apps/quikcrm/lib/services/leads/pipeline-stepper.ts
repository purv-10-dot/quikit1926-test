/**
 * Enterprise pipeline stepper labels + probability mapping.
 * Maps tenant-configured stage strings to a consistent HubSpot-style UI.
 */

export type PipelineStepTone = "neutral" | "active" | "won" | "lost";

export interface PipelineStepDefinition {
  id: string;
  label: string;
  probability: number;
  tone: PipelineStepTone;
  /** Substrings / exact matches against tenant stage values (case-insensitive). */
  aliases: string[];
}

export const ENTERPRISE_PIPELINE_STEPS: PipelineStepDefinition[] = [
  {
    id: "new-lead",
    label: "New Lead",
    probability: 10,
    tone: "neutral",
    aliases: ["new", "new lead"],
  },
  {
    id: "contacted",
    label: "Contacted",
    probability: 25,
    tone: "neutral",
    aliases: ["contacted", "working"],
  },
  {
    id: "qualified",
    label: "Qualified",
    probability: 40,
    tone: "active",
    aliases: ["qualified", "qualification"],
  },
  {
    id: "proposal",
    label: "Proposal Sent",
    probability: 60,
    tone: "active",
    aliases: ["proposal", "proposal sent"],
  },
  {
    id: "negotiation",
    label: "Negotiation",
    probability: 80,
    tone: "active",
    aliases: ["negotiation", "negotiating"],
  },
  {
    id: "won",
    label: "Won",
    probability: 100,
    tone: "won",
    aliases: ["won", "closed won", "closed", "converted"],
  },
  {
    id: "lost",
    label: "Lost",
    probability: 0,
    tone: "lost",
    aliases: ["lost", "closed lost", "disqualified"],
  },
];

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Index of the best-matching enterprise step for a tenant stage string. */
export function resolveStepIndex(currentStage: string): number {
  const n = norm(currentStage);
  for (let i = 0; i < ENTERPRISE_PIPELINE_STEPS.length; i++) {
    const step = ENTERPRISE_PIPELINE_STEPS[i]!;
    if (step.aliases.some((a) => norm(a) === n || n.includes(norm(a)))) {
      return i;
    }
  }
  // Partial label match
  for (let i = 0; i < ENTERPRISE_PIPELINE_STEPS.length; i++) {
    const step = ENTERPRISE_PIPELINE_STEPS[i]!;
    if (norm(step.label) === n || n.includes(norm(step.id))) return i;
  }
  return 0;
}

/**
 * Pick a tenant stage string when user clicks an enterprise step.
 * Prefers exact alias match against tenant stages, else step label.
 */
export function resolveTenantStageForStep(
  step: PipelineStepDefinition,
  tenantStages: string[],
): string {
  const normalizedTenant = tenantStages.map((s) => ({ raw: s, n: norm(s) }));
  for (const alias of step.aliases) {
    const hit = normalizedTenant.find((t) => t.n === norm(alias));
    if (hit) return hit.raw;
  }
  const labelHit = normalizedTenant.find((t) => t.n === norm(step.label));
  if (labelHit) return labelHit.raw;
  return step.label;
}

export function getStepProbability(stepIndex: number): number {
  return ENTERPRISE_PIPELINE_STEPS[stepIndex]?.probability ?? 10;
}
