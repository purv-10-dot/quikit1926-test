/**
 * GET /api/public/pipelines
 *
 * Public (API-key authenticated) list of deal pipelines:
 *
 *   [ { "id": "...", "name": "Sales Pipeline" } ]
 *
 * QuikCRM does not model multiple named opportunity pipelines — the deal
 * pipeline is the single canonical sales pipeline whose stages come from the
 * `CrmOpportunityStage` enum (see lib/services/opportunities/stage-labels.ts,
 * and apps/quikcrm/CLAUDE.md §"Opportunities — stage enum"). So we expose one
 * pipeline with a stable, well-known id. Returning an array keeps the contract
 * forward-compatible if per-org named pipelines are introduced later.
 *
 * `SALES_PIPELINE_ID` is intentionally a fixed slug (not a DB id) — it is the
 * same value the `?pipelineId=` filter on `/api/public/deals` would accept if
 * added later.
 */
import { NextResponse } from "next/server";
import { withPublicApiAuth } from "@/lib/api/public-api-auth";

export const runtime = "nodejs";

/** Stable identifier for the single canonical sales pipeline. */
export const SALES_PIPELINE_ID = "sales";

interface PublicPipeline {
  id: string;
  name: string;
}

export const GET = withPublicApiAuth(async (): Promise<NextResponse> => {
  const pipelines: PublicPipeline[] = [
    { id: SALES_PIPELINE_ID, name: "Sales Pipeline" },
  ];
  return NextResponse.json(pipelines);
});
