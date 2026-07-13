import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";
import { resolve as resolveConflict } from "@/lib/integrations/engines/conflict-engine";
import type { ConflictStrategy } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

/**
 * Resolve a conflict. Body: { conflictId, strategy, selectedFields? }
 * strategy ∈ latest_wins | quikfinance_wins | external_wins | merge | manual.
 */
export async function POST(request: NextRequest) {
  const guard = await integrationContext("write");
  if (!guard.ok) return guard.response;
  try {
    const body = (await request.json()) as { conflictId?: string; strategy?: ConflictStrategy; selectedFields?: Record<string, "internal" | "external"> };
    if (!body.conflictId || !body.strategy) return fail(422, { code: "MISSING_FIELDS", message: "conflictId and strategy are required." });

    const conflicts = await guard.repo.listConflicts(undefined, "open");
    const conflict = conflicts.find((c) => c.id === body.conflictId);
    if (!conflict) return fail(404, { code: "NOT_FOUND", message: "Open conflict not found." });

    const resolution = resolveConflict(
      body.strategy,
      {
        internal: (conflict.internal_data as Record<string, unknown>) ?? null,
        external: (conflict.external_data as Record<string, unknown>) ?? null
      },
      body.selectedFields
    );
    await guard.repo.resolveConflict(body.conflictId, { strategy: body.strategy, ...resolution });
    return ok({ resolved: resolution.outcome, data: "data" in resolution ? resolution.data : null });
  } catch (error) {
    return fail(400, { code: "RESOLVE_FAILED", message: errorMessage(error) });
  }
}
