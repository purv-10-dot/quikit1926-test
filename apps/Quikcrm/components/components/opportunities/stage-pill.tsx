import type { CrmOpportunityStage } from "@quikit/database";
import { STAGE_LABEL } from "@/lib/services/opportunities/stage-labels";

const STAGE_BG: Record<CrmOpportunityStage, string> = {
  Prospecting: "bg-accent-50 text-accent-700",
  Qualification: "bg-accent-50 text-accent-700",
  Proposal: "bg-accent-50 text-accent-700",
  Negotiation: "bg-accent-50 text-accent-700",
  // Closed states use semantic green/red — themed cell backgrounds would make
  // a Won/Lost ambiguous when the tenant has a red or green accent colour.
  ClosedWon: "bg-green-50 text-green-700",
  ClosedLost: "bg-red-50 text-red-700",
};

export function StagePill({ stage }: { stage: CrmOpportunityStage }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_BG[stage]}`}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}
