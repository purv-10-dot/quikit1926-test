import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createKraScorecardSchema } from "@/lib/validations/performance";
import { createAuditLog } from "@/lib/utils/audit";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const designationId = searchParams.get("designationId");
    const departmentId = searchParams.get("departmentId");
    const includeInactive = searchParams.get("includeInactive") === "true";

    const where: Record<string, unknown> = {
      orgId,
      deletedAt: null,
      ...(designationId && { designationId }),
      ...(departmentId && { departmentId }),
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [scorecards, total] = await Promise.all([
      prisma.kraScorecard.findMany({
        where,
        orderBy: [{ effectiveFrom: "desc" }, { name: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          kras: {
            orderBy: { sortOrder: "asc" },
          },
          // Pull status of each assignment so we can derive activeCount /
          // terminalCount client-side without an extra query per row. Cheap
          // because typical scorecards have <100 assignments.
          assignments: {
            where: { deletedAt: null },
            select: { status: true },
          },
          _count: { select: { assignments: { where: { deletedAt: null } } } },
        },
      }),
      prisma.kraScorecard.count({ where }),
    ]);

    // Add derived counts so the UI can decide whether the scorecard is safe to delete.
    const enriched = scorecards.map((sc) => {
      const active = sc.assignments.filter((a) => a.status === "Active").length;
      const total = sc.assignments.length;
      return {
        ...sc,
        activeAssignmentCount: active,
        terminalAssignmentCount: total - active,
        canDelete: active === 0,
      };
    });

    return successResponse(enriched, paginationMeta(page, limit, total));
  } catch (e) {
    console.error("GET /performance/kra-templates error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createKraScorecardSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;

    // Create scorecard + nested KRAs + KPIs in a single transaction.
    const scorecard = await prisma.$transaction(async (tx) => {
      const sc = await tx.kraScorecard.create({
        data: {
          orgId,
          name: data.name,
          description: data.description ?? null,
          designationId: data.designationId ?? null,
          departmentId: data.departmentId ?? null,
          tags: data.tags ?? undefined,
          effectiveFrom: new Date(data.effectiveFrom),
          isActive: data.isActive,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      for (const [kraIdx, kra] of data.kras.entries()) {
        await tx.kraTemplateEntry.create({
          data: {
            scorecardId: sc.id,
            title: kra.title,
            description: kra.description ?? null,
            weight: kra.weight,
            sortOrder: kra.sortOrder ?? kraIdx,
            // KPIs are nested config — stored as a JSON array (each gets a stable
            // id so assignment snapshots + progress can key against it).
            kpis: kra.kpis.map((kpi, kpiIdx) => ({
              id: randomUUID(),
              title: kpi.title,
              description: kpi.description ?? null,
              measurementMethod: kpi.measurementMethod ?? null,
              target: kpi.target ?? null,
              unit: kpi.unit ?? null,
              weight: kpi.weight,
              sortOrder: kpi.sortOrder ?? kpiIdx,
            })),
          },
        });
      }
      return sc;
    });

    await createAuditLog({
      orgId, userId, action: "Create",
      entityType: "KraScorecard", entityId: scorecard.id, changes: { name: data.name, krasCount: data.kras.length },
    });

    return successResponse(scorecard, undefined, 201);
  } catch (e) {
    console.error("POST /performance/kra-templates error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
