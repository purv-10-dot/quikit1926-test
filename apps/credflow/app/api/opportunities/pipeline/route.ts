import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import type { SessionUser } from "@/types/permission";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { pipelineFilterSchema } from "@/lib/services/opportunities/validators";
import { buildOpportunityFilterWhere } from "@/lib/services/opportunities/filter-engine";
import { getPipelineBoard } from "@/lib/services/opportunities/pipeline-service";

export const runtime = "nodejs";

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

type PipelineFilter = {
  conditions: { field: string; operator: string; value?: unknown; values?: unknown[] }[];
  combinator: "AND" | "OR";
  search?: string;
};

async function loadBoard(user: SessionUser, filter?: PipelineFilter) {
  await assertModule(user, "opportunities", "view");

  const acl = await accountScopeFilter(user);
  if (acl && Array.isArray((acl as { OR?: unknown[] }).OR) === false) {
    return NextResponse.json({
      success: true,
      data: {
        columns: [],
        totalsByCurrency: [],
        totalPipelineInr: 0,
        totalWeightedInr: 0,
        thisQuarterForecastInr: 0,
        atRisk: { stuckDeals: 0, noActivity7d: 0, closingThisMonth: 0 },
      },
    });
  }

  const hasFilter =
    (filter?.conditions?.length ?? 0) > 0 || Boolean(filter?.search?.trim());

  const where = hasFilter
    ? buildOpportunityFilterWhere({
        tenantId: user.tenantId,
        aclFilter: acl,
        conditions: filter?.conditions ?? [],
        combinator: filter?.combinator ?? "AND",
        search: filter?.search,
      })
    : undefined;

  const board = await getPipelineBoard({
    tenantId: user.tenantId,
    aclFilter: acl,
    where,
  });
  return NextResponse.json({ success: true, data: board });
}

/** Unfiltered board (backward compatible). */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    return await loadBoard(user);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load pipeline";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}

/** Board with advanced filter + quick search. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const body = await req.json().catch(() => ({}));
    const parsed = pipelineFilterSchema.safeParse(body);
    if (!parsed.success) {
      return err(
        "Validation failed: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        400,
      );
    }
    return await loadBoard(user, parsed.data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load pipeline";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}
