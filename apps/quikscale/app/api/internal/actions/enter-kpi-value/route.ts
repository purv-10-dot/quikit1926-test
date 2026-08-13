import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { upsertAndRecalc } from "@/lib/services/kpiWeeklyValue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/actions/enter-kpi-value — service-to-service only.
 *
 * Called by QuikFlow's `kpi.value.enter` action executor to record a weekly KPI
 * reading on behalf of an automation. Reuses the SAME `upsertAndRecalc` the
 * user-facing weekly route uses, so an automation-entered value re-aggregates
 * qtdAchieved → progress% → healthStatus identically (RAG stays derived; the
 * endpoint never writes it directly).
 *
 * Auth mirrors the other internal routes: shared INTERNAL_SECRET via
 * `x-internal-secret`, explicit orgId + actorId in the body (no user session).
 * userId (whose weekly cell) defaults to the KPI owner for an individual KPI.
 * Deliberately does NOT enforce the UI's week-lock — an automation may backfill
 * or forward-fill any week.
 */
const bodySchema = z.object({
  orgId: z.string().min(1),
  actorId: z.string().min(1),
  kpiId: z.string().min(1),
  weekNumber: z.number().int().min(1).max(53),
  value: z.number().nullable().optional(),
  userId: z.string().min(1).optional(),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const b = parsed.data;

  try {
    // Org-scoped fetch — a KPI from another org is invisible (tenant isolation).
    const kpi = await db.kPI.findFirst({
      where: { id: b.kpiId, orgId: b.orgId },
      select: { kpiLevel: true, owner: true, ownerIds: true, parentKPIId: true },
    });
    if (!kpi) {
      return NextResponse.json({ success: false, error: "KPI not found in org" }, { status: 404 });
    }

    // Resolve whose cell: explicit userId, else the individual KPI's owner.
    const targetUserId = b.userId ?? (kpi.kpiLevel === "individual" ? kpi.owner : null);
    if (!targetUserId) {
      return NextResponse.json(
        { success: false, error: "userId is required for a team KPI weekly value" },
        { status: 400 },
      );
    }
    if (kpi.kpiLevel === "team" && !(kpi.ownerIds ?? []).includes(targetUserId)) {
      return NextResponse.json(
        { success: false, error: "The selected user is not a contributor on this Team KPI." },
        { status: 400 },
      );
    }

    await upsertAndRecalc({
      kpiId: b.kpiId,
      orgId: b.orgId,
      userId: targetUserId,
      weekNumber: b.weekNumber,
      value: b.value ?? null,
      notes: b.notes ?? null,
      changedBy: b.actorId,
    });

    // Mirror the route's Team ↔ child Individual sync so aggregates stay consistent.
    if (kpi.kpiLevel === "team") {
      const child = await db.kPI.findFirst({
        where: { parentKPIId: b.kpiId, owner: targetUserId, deletedAt: null },
        select: { id: true, orgId: true },
      });
      if (child) {
        await upsertAndRecalc({
          kpiId: child.id,
          orgId: child.orgId,
          userId: targetUserId,
          weekNumber: b.weekNumber,
          value: b.value ?? null,
          notes: b.notes ?? null,
          changedBy: b.actorId,
        });
      }
    } else if (kpi.parentKPIId) {
      await upsertAndRecalc({
        kpiId: kpi.parentKPIId,
        orgId: b.orgId,
        userId: targetUserId,
        weekNumber: b.weekNumber,
        value: b.value ?? null,
        notes: b.notes ?? null,
        changedBy: b.actorId,
      });
    }

    return NextResponse.json(
      { success: true, data: { kpiId: b.kpiId, weekNumber: b.weekNumber, value: b.value ?? null } },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to enter KPI value";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
