import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { assignKraSchema } from "@/lib/validations/performance";
import { createAuditLog } from "@/lib/utils/audit";
import type { Prisma } from "@quikit/database";

interface SnapshotKpi {
  id: string;
  title: string;
  description: string | null;
  measurementMethod: string | null;
  target: string | null;
  unit: string | null;
  weight: number;
}
interface SnapshotKra {
  id: string;
  title: string;
  description: string | null;
  weight: number;
  kpis: SnapshotKpi[];
}
interface Snapshot {
  scorecardName: string;
  effectiveFromAtAssignment: string;
  kras: SnapshotKra[];
}

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");
    const scorecardId = searchParams.get("scorecardId");

    const where: Prisma.EmployeeKraAssignmentWhereInput = {
      orgId,
      deletedAt: null,
      ...(employeeId && { employeeId }),
      ...(status && { status: status as Prisma.EnumKraAssignmentStatusFilter["equals"] }),
      ...(scorecardId && { scorecardId }),
    };

    const assignments = await prisma.employeeKraAssignment.findMany({
      where,
      orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      include: {
        scorecard: { select: { id: true, name: true, designationId: true, departmentId: true } },
      },
    });

    const empIds = [...new Set(assignments.map((a) => a.employeeId))];
    const employees = empIds.length
      ? await prisma.employee.findMany({
          where: { orgId, deletedAt: null, id: { in: empIds } },
          select: {
            id: true, employeeCode: true, firstName: true, lastName: true,
            profilePhoto: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
          },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const rows = assignments.map((a) => ({
      ...a,
      employee: empMap.get(a.employeeId) ?? null,
    }));

    return successResponse(rows);
  } catch (e) {
    console.error("GET /performance/kra-assignments error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = assignKraSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const { scorecardId, employeeIds, effectiveFrom, effectiveTo, cycleId } = parsed.data;

    const scorecard = await prisma.kraScorecard.findFirst({
      where: { id: scorecardId, orgId, deletedAt: null },
      include: {
        kras: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!scorecard) return notFound("Scorecard not found");

    // Freeze the current template into the snapshot — preserves KRA/KPI IDs
    // so progress can be keyed against them stably.
    const snapshot: Snapshot = {
      scorecardName: scorecard.name,
      effectiveFromAtAssignment: scorecard.effectiveFrom.toISOString().slice(0, 10),
      kras: scorecard.kras.map((kra) => ({
        id: kra.id,
        title: kra.title,
        description: kra.description,
        weight: Number(kra.weight),
        kpis: (kra.kpis as unknown as SnapshotKpi[]).map((kpi) => ({
          id: kpi.id,
          title: kpi.title,
          description: kpi.description,
          measurementMethod: kpi.measurementMethod,
          target: kpi.target,
          unit: kpi.unit,
          weight: Number(kpi.weight),
        })),
      })),
    };

    const effFrom = new Date(effectiveFrom);
    const effTo = effectiveTo ? new Date(effectiveTo) : null;

    // De-dup: skip employees that either (a) have an ACTIVE assignment for
    // this scorecard, or (b) already have ANY assignment on the same
    // effectiveFrom date (the @@unique([employeeId, scorecardId, effectiveFrom])
    // would throw P2002 otherwise — even for Cancelled rows).
    const existing = await prisma.employeeKraAssignment.findMany({
      where: {
        orgId,
        scorecardId,
        employeeId: { in: employeeIds },
        deletedAt: null,
        OR: [
          { status: "Active" },
          { effectiveFrom: effFrom },
        ],
      },
      select: { employeeId: true },
    });
    const existingSet = new Set(existing.map((e) => e.employeeId));
    const newEmpIds = employeeIds.filter((id) => !existingSet.has(id));

    const created = newEmpIds.length > 0
      ? await prisma.employeeKraAssignment.createManyAndReturn({
          data: newEmpIds.map((empId) => ({
            orgId,
            employeeId: empId,
            scorecardId,
            cycleId: cycleId ?? null,
            effectiveFrom: effFrom,
            effectiveTo: effTo,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            progress: {} as Prisma.InputJsonValue,
            status: "Active",
            createdBy: userId,
          })),
        })
      : [];

    await createAuditLog({
      orgId,
      userId,
      action: "Create",
      entityType: "EmployeeKraAssignment",
      metadata: { scorecardId, count: created.length, skippedDuplicates: existingSet.size },
    });

    return successResponse({
      created: created.length,
      skippedDuplicates: existingSet.size,
      assignments: created,
    }, undefined, 201);
  } catch (e) {
    console.error("POST /performance/kra-assignments error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
