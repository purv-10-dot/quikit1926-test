import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { updateKraScorecardSchema } from "@/lib/validations/performance";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const scorecard = await prisma.kraScorecard.findFirst({
      where: { id, orgId, deletedAt: null },
      include: {
        kras: {
          orderBy: { sortOrder: "asc" },
        },
        _count: { select: { assignments: { where: { deletedAt: null } } } },
      },
    });
    if (!scorecard) return notFound("Scorecard not found");
    return successResponse(scorecard);
  } catch (e) {
    console.error("GET /performance/kra-templates/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = updateKraScorecardSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;

    const existing = await prisma.kraScorecard.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Scorecard not found");

    // Replace-all strategy for nested KRAs/KPIs when provided. Per the agreed
    // "edits don't affect existing assignments" rule, the snapshot on each
    // EmployeeKraAssignment row carries the old version forward — so it's
    // safe to wipe and rewrite the template's KRAs/KPIs here.
    await prisma.$transaction(async (tx) => {
      await tx.kraScorecard.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description ?? null } : {}),
          ...(data.designationId !== undefined ? { designationId: data.designationId ?? null } : {}),
          ...(data.departmentId !== undefined ? { departmentId: data.departmentId ?? null } : {}),
          ...(data.tags !== undefined ? { tags: data.tags ?? undefined } : {}),
          ...(data.effectiveFrom ? { effectiveFrom: new Date(data.effectiveFrom) } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          updatedBy: userId,
        },
      });
      if (data.kras) {
        await tx.kraTemplateEntry.deleteMany({ where: { scorecardId: id } });
        for (const [kraIdx, kra] of data.kras.entries()) {
          await tx.kraTemplateEntry.create({
            data: {
              scorecardId: id,
              title: kra.title,
              description: kra.description ?? null,
              weight: kra.weight,
              sortOrder: kra.sortOrder ?? kraIdx,
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
      }
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "KraScorecard", entityId: id, changes: data,
    });
    return successResponse({ id });
  } catch (e) {
    console.error("PUT /performance/kra-templates/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.kraScorecard.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Scorecard not found");

    // Block deletion only while there are ACTIVE assignments. Once every
    // assignment is in a terminal state (Completed / Cancelled), HR can
    // delete the scorecard — the assignment rows carry frozen snapshots,
    // so the audit trail survives.
    const activeCount = await prisma.employeeKraAssignment.count({
      where: { orgId, scorecardId: id, deletedAt: null, status: "Active" },
    });
    if (activeCount > 0) {
      return conflict(
        `Cannot delete — scorecard has ${activeCount} active assignment${activeCount === 1 ? "" : "s"}. Complete or cancel ${activeCount === 1 ? "it" : "them"} first.`,
      );
    }

    await prisma.kraScorecard.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    await createAuditLog({
      orgId, userId, action: "Delete", entityType: "KraScorecard", entityId: id,
    });
    return successResponse({ id, deleted: true });
  } catch (e) {
    console.error("DELETE /performance/kra-templates/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
