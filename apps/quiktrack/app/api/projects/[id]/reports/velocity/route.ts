import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { averageVelocity } from "@/lib/reports/productivity";

/**
 * Velocity report for a project — Jira semantics.
 *
 * Returns ONLY COMPLETED sprints, reading the frozen QtSprintSnapshot rows
 * VERBATIM. Nothing is recomputed here: velocity was calculated once when each
 * sprint was completed (see /api/sprints/[id]/complete) and is immutable, so
 * editing issues later never changes a past sprint's numbers. Active, planning
 * and future sprints are excluded entirely (a live "Sprint Progress" report is
 * a separate feature).
 *
 * Each sprint row carries both axes — story points and estimated hours — plus a
 * points-based completion %. Averages are over the completed sprints shown.
 */
export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }) => {
    // Completed sprints joined to their snapshot. A completed sprint without a
    // snapshot (e.g. completed before this feature existed) is skipped — there
    // is no stored velocity to show, and we never recompute one.
    const sprints = await db.qtSprint.findMany({
      where: { projectId, isDeleted: false, status: "COMPLETED" },
      orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        completedAt: true,
        snapshot: {
          select: {
            committedPoints: true,
            completedPoints: true,
            committedHours: true,
            completedHours: true,
            committedCount: true,
            completedCount: true,
            completionPct: true,
            completedAt: true,
          },
        },
      },
    });

    const rows = sprints
      .filter((s) => s.snapshot !== null)
      .map((s) => {
        const snap = s.snapshot!;
        return {
          sprintId: s.id,
          sprintName: s.name,
          completedAt: (snap.completedAt ?? s.completedAt)?.toISOString() ?? null,
          committedPoints: snap.committedPoints,
          completedPoints: snap.completedPoints,
          committedHours: snap.committedHours,
          completedHours: snap.completedHours,
          committedCount: snap.committedCount,
          completedCount: snap.completedCount,
          completionPct: snap.completionPct,
        };
      });

    const hasEstimates = rows.some(
      (r) => r.committedPoints > 0 || r.completedPoints > 0,
    );
    const hasHours = rows.some(
      (r) => r.committedHours > 0 || r.completedHours > 0,
    );

    return NextResponse.json({
      success: true,
      data: {
        sprints: rows,
        // Averages over completed sprints only (Jira's definition).
        averagePoints: averageVelocity(rows.map((r) => r.completedPoints)),
        averageHours: averageVelocity(rows.map((r) => r.completedHours)),
        hasEstimates,
        hasHours,
      },
    });
  },
  { paramKey: "id", requirePermission: { resource: "ProjectReports", action: "view" } },
);
