import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import {
  updateKraAssignmentProgressSchema,
  updateKraAssignmentStatusSchema,
} from "@/lib/validations/performance";
import { createAuditLog } from "@/lib/utils/audit";
import type { Prisma } from "@quikit/database";

interface SnapshotKpi {
  id: string; title: string; description: string | null;
  measurementMethod: string | null; target: string | null; unit: string | null;
  weight: number;
}
interface SnapshotKra {
  id: string; title: string; description: string | null;
  weight: number; kpis: SnapshotKpi[];
}
interface Snapshot { scorecardName: string; effectiveFromAtAssignment: string; kras: SnapshotKra[] }
interface ProgressEntry { currentValue?: string | null; score?: number | null; notes?: string | null; updatedAt?: string }

/**
 * Composite = Σ_KRA ( KRA.weight × Σ_KPI ( KPI.weight × KPI.score ) / 100 / 100 )
 * Score is 0-5. Returns null if no KPIs scored.
 */
function computeComposite(snapshot: Snapshot, progress: Record<string, ProgressEntry>): number | null {
  let kraSum = 0;
  let weightedKpiCount = 0;
  for (const kra of snapshot.kras) {
    let kpiSum = 0;
    let scoredKpiWeight = 0;
    for (const kpi of kra.kpis) {
      const p = progress[kpi.id];
      if (p?.score == null) continue;
      kpiSum += kpi.weight * p.score;
      scoredKpiWeight += kpi.weight;
      weightedKpiCount++;
    }
    if (scoredKpiWeight > 0) {
      // Normalize: kpiSum / scoredKpiWeight gives the avg score (0-5) across scored KPIs
      kraSum += (kra.weight * kpiSum) / scoredKpiWeight / 100;
    }
  }
  if (weightedKpiCount === 0) return null;
  return Math.round(kraSum * 100) / 100;
}

export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const assignment = await prisma.employeeKraAssignment.findFirst({
      where: { id, orgId, deletedAt: null },
      include: {
        scorecard: { select: { id: true, name: true, description: true, designationId: true, departmentId: true } },
      },
    });
    if (!assignment) return notFound("Assignment not found");

    const employee = await prisma.employee.findFirst({
      where: { id: assignment.employeeId, orgId, deletedAt: null },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true,
        workEmail: true, profilePhoto: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
      },
    });

    return successResponse({ ...assignment, employee });
  } catch (e) {
    console.error("GET /performance/kra-assignments/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();

    const existing = await prisma.employeeKraAssignment.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Assignment not found");

    // Two operation modes:
    //   1) { progress: { kpiId: { score, currentValue, notes } } } — merges into existing
    //   2) { status: "Active" | "Completed" | "Cancelled" }
    if ("status" in body) {
      const parsed = updateKraAssignmentStatusSchema.safeParse(body);
      if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
      // Cancelled is terminal — you can't transition out of it (only Active↔Completed reopen).
      if (existing.status === "Cancelled" && parsed.data.status !== "Cancelled") {
        return conflict("A cancelled KRA assignment can't be re-activated or completed.");
      }
      const updated = await prisma.employeeKraAssignment.update({
        where: { id },
        data: { status: parsed.data.status },
      });
      await createAuditLog({
        orgId, userId, action: "Update",
        entityType: "EmployeeKraAssignment", entityId: id, changes: parsed.data,
      });
      return successResponse(updated);
    }

    // Progress can't be edited on a cancelled assignment.
    if (existing.status === "Cancelled") {
      return conflict("This KRA assignment is cancelled — progress can no longer be edited.");
    }

    const parsed = updateKraAssignmentProgressSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const snapshot = existing.snapshot as unknown as Snapshot;
    const currentProgress = (existing.progress as unknown as Record<string, ProgressEntry>) ?? {};

    // Validate every kpiId in the patch actually exists in the snapshot.
    const validKpiIds = new Set(snapshot.kras.flatMap((k) => k.kpis.map((p) => p.id)));
    const stamp = new Date().toISOString();
    const merged: Record<string, ProgressEntry> = { ...currentProgress };
    for (const [kpiId, entry] of Object.entries(parsed.data.progress)) {
      if (!validKpiIds.has(kpiId)) {
        return validationError(`Unknown KPI id: ${kpiId}`);
      }
      const prev = merged[kpiId] ?? {};
      merged[kpiId] = {
        currentValue: entry.currentValue !== undefined ? entry.currentValue : prev.currentValue,
        score: entry.score !== undefined ? entry.score : prev.score,
        notes: entry.notes !== undefined ? entry.notes : prev.notes,
        updatedAt: stamp,
      };
    }

    const composite = computeComposite(snapshot, merged);

    const updated = await prisma.employeeKraAssignment.update({
      where: { id },
      data: {
        progress: merged as unknown as Prisma.InputJsonValue,
        compositeScore: composite,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Update",
      entityType: "EmployeeKraAssignment", entityId: id,
      metadata: { kpisUpdated: Object.keys(parsed.data.progress).length, composite },
    });

    return successResponse(updated);
  } catch (e) {
    console.error("PATCH /performance/kra-assignments/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.employeeKraAssignment.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Assignment not found");

    await prisma.employeeKraAssignment.update({
      where: { id },
      data: { deletedAt: new Date(), status: "Cancelled" },
    });
    await createAuditLog({
      orgId, userId, action: "Delete",
      entityType: "EmployeeKraAssignment", entityId: id,
    });
    return successResponse({ id, deleted: true });
  } catch (e) {
    console.error("DELETE /performance/kra-assignments/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
