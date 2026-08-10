import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getPipelineConfig, setPipelineConfig } from "@/lib/services/workspace/pipeline-config";

export const runtime = "nodejs";

/**
 * GET /api/settings/workspace
 *   Returns the org's lead pipeline config: stages, statuses, dependent rules.
 *   Used by the Add-Lead form to drive Stage/Status dropdowns and dependency filtering.
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const cfg = await getPipelineConfig(user.tenantId);
    return NextResponse.json({ leadPipelineConfig: cfg });
  } catch (e) {
    return errorResponse(e);
  }
}

const dependentRulesSchema = z.object({
  sourceToStages: z.record(z.array(z.string())).optional(),
  stageToStatuses: z.record(z.array(z.string())).optional(),
});

const pipelinePatchSchema = z.object({
  stages: z.array(z.string().min(1)).optional(),
  statuses: z.array(z.string().min(1)).optional(),
  dependentRules: dependentRulesSchema.optional(),
});

/**
 * PATCH /api/settings/workspace
 *   Updates one or more parts of the lead pipeline config.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const parsed = pipelinePatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const next = await setPipelineConfig(user.tenantId, parsed.data);
    return NextResponse.json({ leadPipelineConfig: next });
  } catch (e) {
    return errorResponse(e);
  }
}
