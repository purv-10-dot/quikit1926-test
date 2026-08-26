import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { getAllStageNames } from "@/lib/recruit/pipeline-targets";

// Raw SQL on purpose — JobLevel isn't in the generated Prisma client yet
// (same reason as ../route.ts).

/**
 * GET/PATCH /api/v1/hrms/settings/job-levels/pipeline-targets
 *
 * "Minimum candidates/day per pipeline stage" targets, one row per Job
 * Level — a daily-throughput/productivity benchmark, distinct from the
 * elapsed-day SLA fields on JobLevel. The stage list is NOT hardcoded: the
 * middle stages come live from EVERY pipeline the org has (not just the
 * default one — see getAllStageNames), so renaming/adding/removing a stage
 * on any pipeline is reflected here automatically. "Sourcing" (before a
 * candidate enters any formal stage) and "Onboarding" (after Hired) are
 * fixed bookends no pipeline models as a real stage.
 */

interface LevelRow {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  stageDailyTargets: Record<string, number> | null;
}

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const [levels, stages] = await Promise.all([
      prisma.$queryRaw<LevelRow[]>`
        SELECT id, code, name, "sortOrder", "stageDailyTargets"
        FROM "app_quikhrms"."JobLevel"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND "isActive" = true
        ORDER BY "sortOrder" ASC, "slaDays" ASC
      `,
      getAllStageNames(orgId),
    ]);

    return successResponse({
      stages,
      levels: levels.map((l) => ({ id: l.id, code: l.code, name: l.name, targets: l.stageDailyTargets ?? {} })),
    });
  } catch (error) {
    console.error("GET /settings/job-levels/pipeline-targets error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

const patchSchema = z.object({
  // { [jobLevelId]: { [stageName]: targetPerDay } } — each level's FULL row
  // is replaced with whatever's sent for it (the grid always submits every
  // cell it shows, so a blanked-out cell is a real "no target", not a gap).
  targets: z.record(z.string(), z.record(z.string().min(1).max(60), z.number().int().min(0).max(999))),
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const jobLevelIds = Object.keys(parsed.data.targets);
    if (jobLevelIds.length === 0) return successResponse({ updated: 0 });

    const owned = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "app_quikhrms"."JobLevel"
      WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND id = ANY(${jobLevelIds})
    `;
    const ownedIds = new Set(owned.map((r) => r.id));
    const unknown = jobLevelIds.filter((id) => !ownedIds.has(id));
    if (unknown.length > 0) return validationError(`Unknown job level id(s): ${unknown.join(", ")}`);

    for (const id of jobLevelIds) {
      const row = parsed.data.targets[id];
      await prisma.$executeRaw`
        UPDATE "app_quikhrms"."JobLevel"
        SET "stageDailyTargets" = ${JSON.stringify(row)}::jsonb, "updatedBy" = ${userId}, "updatedAt" = NOW()
        WHERE id = ${id} AND "orgId" = ${orgId}
      `;
    }

    return successResponse({ updated: jobLevelIds.length });
  } catch (error) {
    console.error("PATCH /settings/job-levels/pipeline-targets error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
