/**
 * GET /api/public/deals
 *
 * Public (API-key authenticated) list of deals (CRM opportunities), mapped
 * into the third-party integration contract:
 *
 *   {
 *     "items": [
 *       {
 *         "id": "...",
 *         "amount": 5000,
 *         "stage": "Negotiation",
 *         "closeDate": "2026-07-15",
 *         "createDate": "2026-06-01",
 *         "status": "open"
 *       }
 *     ],
 *     "page": 1,
 *     "totalPages": 5
 *   }
 *
 * Reuses the existing `listOpportunities` service (same `where`, ordering, and
 * pagination the internal `/api/opportunities` endpoint uses) so there is no
 * duplicated business logic — only the shaping into the public contract lives
 * here. Pagination follows the app's page/pageSize contract; callers page with
 * `?page=` and `?pageSize=` (allow-listed sizes 10/25/50/100, default 10).
 *
 * Only active (non-trashed) opportunities are returned, scoped to the API
 * key's `orgId`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { CrmOpportunityStage } from "@quikit/database";
import { withPublicApiAuth } from "@/lib/api/public-api-auth";
import { listOpportunities } from "@/lib/services/opportunities/opportunity-service";
import { toNumber } from "@/lib/services/opportunities/currency";
import { STAGE_LABEL } from "@/lib/services/opportunities/stage-labels";
import { pageSchema, pageSizeSchema } from "@/lib/validators/pagination";

export const runtime = "nodejs";

const querySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
});

type DealStatus = "open" | "won" | "lost";

interface PublicDeal {
  id: string;
  amount: number | null;
  stage: string;
  closeDate: string | null;
  createDate: string;
  status: DealStatus;
}

interface PublicDealsResponse {
  items: PublicDeal[];
  page: number;
  totalPages: number;
}

/** Derive the public deal status from the canonical stage enum. */
function statusForStage(stage: CrmOpportunityStage): DealStatus {
  if (stage === "ClosedWon") return "won";
  if (stage === "ClosedLost") return "lost";
  return "open";
}

/** ISO date (YYYY-MM-DD) — the public contract uses dates, not timestamps. */
function toIsoDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export const GET = withPublicApiAuth(
  async ({ orgId }, req: NextRequest): Promise<NextResponse> => {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid query: " +
            parsed.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
        },
        { status: 400 },
      );
    }

    const result = await listOpportunities({
      orgId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      trashed: false,
      aclFilter: null,
    });

    const items: PublicDeal[] = result.items.map((it) => ({
      id: it.id,
      amount: it.amount == null ? null : toNumber(it.amount),
      stage: STAGE_LABEL[it.stage],
      closeDate: toIsoDate(it.closeDate),
      // `createDate` in the public contract == the row's createdAt.
      createDate: toIsoDate(it.createdAt) as string,
      status: statusForStage(it.stage),
    }));

    const body: PublicDealsResponse = {
      items,
      page: result.page,
      totalPages: result.totalPages,
    };
    return NextResponse.json(body);
  },
);
