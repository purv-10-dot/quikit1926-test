/**
 * Server-safe mappers for Account 360 overview props.
 * Keep out of "use client" modules so RSC pages can import them.
 */

import type { QcfOpportunityStage } from "@quikit/database";
import { STAGE_LABEL } from "@/lib/services/opportunities/stage-labels";
import { formatGeneric } from "@/lib/services/opportunities/currency";

export interface AccountOverviewOpportunityRow {
  id: string;
  name: string;
  stage: string;
  amountDisplay?: string | null;
}

export function mapAccountOpportunitiesForOverview(
  opps: {
    id: string;
    name: string;
    stage: string;
    amount: unknown;
    currency: string | null;
  }[],
): AccountOverviewOpportunityRow[] {
  return opps.map((o) => ({
    id: o.id,
    name: o.name,
    stage: STAGE_LABEL[o.stage as QcfOpportunityStage] ?? o.stage,
    amountDisplay:
      o.amount != null ? formatGeneric(Number(o.amount), o.currency ?? "INR") : null,
  }));
}
