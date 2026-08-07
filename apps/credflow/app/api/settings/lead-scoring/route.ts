import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getLeadScoringConfig, setLeadScoringConfig } from "@/lib/services/leads/lead-scoring/config";
import { configSchema } from "@/lib/services/leads/lead-scoring/schema";
import { recalculateAllLeadScores } from "@/lib/services/leads/lead-scoring/apply-score";
import { LEAD_SCORING_FIELD_DEFS } from "@/lib/services/leads/lead-scoring/fields";
import { computeLeadScore } from "@/lib/services/leads/lead-scoring/compute-score";
import { loadLeadScoringContext } from "@/lib/services/leads/lead-scoring/apply-score";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const patchBodySchema = z.object({
  config: configSchema.partial().optional(),
  recalculateAll: z.boolean().optional(),
  previewLeadId: z.string().optional(),
});

export async function GET(_req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const config = await getLeadScoringConfig(user.orgId);
    return NextResponse.json({
      success: true,
      data: {
        config,
        fields: LEAD_SCORING_FIELD_DEFS,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");

    const parsed = patchBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    let config = await getLeadScoringConfig(user.orgId);
    if (parsed.data.config) {
      config = await setLeadScoringConfig(user.orgId, parsed.data.config);
    }

    let recalc: { processed: number; updated: number } | undefined;
    if (parsed.data.recalculateAll) {
      recalc = await recalculateAllLeadScores(user.orgId);
    }

    let preview: { score: number; breakdown: unknown } | undefined;
    if (parsed.data.previewLeadId) {
      const lead = await prisma.qcfLead.findFirst({
        where: { id: parsed.data.previewLeadId, orgId: user.orgId, deletedAt: null },
      });
      if (lead) {
        const ctx = await loadLeadScoringContext(user.orgId, lead.id, lead.createdAt);
        const breakdown = computeLeadScore(
          {
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            mobile: lead.mobile,
            company: lead.company,
            jobTitle: lead.jobTitle,
            source: lead.source,
            stage: lead.stage,
            status: lead.status,
            substatus: lead.substatus,
            industry: lead.industry,
            country: lead.country,
            leadQuality: lead.leadQuality,
            isStarred: lead.isStarred,
            isDisengaged: lead.isDisengaged,
            followupPriority: lead.followupPriority,
            website: lead.website ?? null,
            linkedinUrl: lead.linkedinUrl ?? null,
            dynamicFields: (lead.dynamicFields as Record<string, unknown> | null) ?? null,
          },
          ctx,
          config,
        );
        preview = { score: breakdown.total, breakdown };
      }
    }

    return NextResponse.json({
      success: true,
      data: { config, recalculateAll: recalc, preview },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
