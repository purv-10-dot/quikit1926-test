import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { HARDCODED_DEFAULTS, KIND_ORDER, type OneTimeKind } from "@/lib/services/one-time-defaults";

/**
 * GET /api/v1/hrms/payroll/one-time-earnings/defaults
 * Returns the effective tax / statutory flags for every Kind for this tenant.
 * Merges per-tenant overrides on top of the hardcoded fallback.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const rows = await prisma.oneTimeStatutoryDefault.findMany({
      where: { orgId },
      select: { kind: true, taxable: true, considerForEPF: true, considerForESI: true, considerForPT: true, updatedAt: true },
    });
    const byKind = new Map(rows.map((r) => [r.kind, r]));

    const merged = KIND_ORDER.map((kind) => {
      const row = byKind.get(kind);
      const fb = HARDCODED_DEFAULTS[kind];
      return {
        kind,
        taxable: row?.taxable ?? fb.taxable,
        considerForEPF: row?.considerForEPF ?? fb.considerForEPF,
        considerForESI: row?.considerForESI ?? fb.considerForESI,
        considerForPT: row?.considerForPT ?? fb.considerForPT,
        isCustom: !!row,
        updatedAt: row?.updatedAt ?? null,
      };
    });

    return successResponse(merged);
  } catch (e) {
    console.error("GET /payroll/one-time-earnings/defaults error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

const updateSchema = z.object({
  defaults: z.array(z.object({
    kind: z.enum(KIND_ORDER as [OneTimeKind, ...OneTimeKind[]]),
    taxable: z.boolean(),
    considerForEPF: z.boolean(),
    considerForESI: z.boolean(),
    considerForPT: z.boolean(),
  })).min(1).max(KIND_ORDER.length),
});

/**
 * PUT /api/v1/hrms/payroll/one-time-earnings/defaults
 * Upserts each provided kind's flags. Only the kinds in the body are touched —
 * omitted kinds keep their current value (or the hardcoded fallback if never set).
 */
export const PUT = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    await prisma.$transaction(
      parsed.data.defaults.map((d) =>
        prisma.oneTimeStatutoryDefault.upsert({
          where: { orgId_kind: { orgId, kind: d.kind } },
          create: {
            orgId, kind: d.kind,
            taxable: d.taxable,
            considerForEPF: d.considerForEPF,
            considerForESI: d.considerForESI,
            considerForPT: d.considerForPT,
            createdBy: userId, updatedBy: userId,
          },
          update: {
            taxable: d.taxable,
            considerForEPF: d.considerForEPF,
            considerForESI: d.considerForESI,
            considerForPT: d.considerForPT,
            updatedBy: userId,
          },
        }),
      ),
    );

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "OneTimeStatutoryDefault", entityId: "all",
      changes: { defaults: parsed.data.defaults }, request: req,
    });

    return successResponse({ saved: parsed.data.defaults.length });
  } catch (e) {
    console.error("PUT /payroll/one-time-earnings/defaults error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
