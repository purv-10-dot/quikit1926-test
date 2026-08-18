import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getPastWeekFlags } from "@/lib/utils/featureFlags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/actions/update-kpi — service-to-service only.
 *
 * Called by QuikFlow's `kpi.update` + `kpi.archive` executors. WHITELISTED
 * fields only — deliberately EXCLUDES every derived column (healthStatus /
 * progressPercent / qtdAchieved / qtdGoal): those are computed from weekly
 * values and must never be written by an automation (keeps the traffic-light
 * semantics intact). `target` respects the org's "Add Past Week Data" lock, the
 * same rule the KPI edit panel enforces. `archived:true` soft-archives
 * (status → "archived"). Org-scoped via findFirst + updateMany(where:{id,orgId}).
 */
const bodySchema = z.object({
  orgId: z.string().min(1),
  actorId: z.string().min(1),
  kpiId: z.string().min(1),
  patch: z
    .object({
      name: z.string().min(1).max(200).optional(),
      owner: z.string().min(1).optional(),
      description: z.string().max(1000).nullable().optional(),
      measurementUnit: z.string().min(1).max(60).optional(),
      kpiType: z.string().min(1).max(30).optional(),
      target: z.number().nullable().optional(),
      archived: z.boolean().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, "patch must set at least one field"),
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
  const p = b.patch;

  try {
    const kpi = await db.kPI.findFirst({
      where: { id: b.kpiId, orgId: b.orgId },
      select: { kpiLevel: true },
    });
    if (!kpi) {
      return NextResponse.json({ success: false, error: "KPI not found in org" }, { status: 404 });
    }

    // Target edits obey the same "Add Past Week Data" lock as the UI edit panel.
    if (p.target !== undefined) {
      const { canEditPastWeek } = await getPastWeekFlags(b.orgId);
      if (!canEditPastWeek) {
        return NextResponse.json(
          { success: false, error: "Target is locked (Add Past Week Data is disabled)." },
          { status: 409 },
        );
      }
    }

    const data: Record<string, unknown> = { updatedBy: b.actorId };
    if (p.name !== undefined) data.name = p.name;
    if (p.description !== undefined) data.description = p.description;
    if (p.measurementUnit !== undefined) data.measurementUnit = p.measurementUnit;
    if (p.kpiType !== undefined) data.kpiType = p.kpiType;
    if (p.target !== undefined) data.target = p.target;
    if (p.owner !== undefined) {
      data.owner = p.owner;
      // Keep the ownerIds array in sync for an individual KPI; leave team
      // rosters (ownerIds) untouched to avoid corrupting a Team KPI.
      if (kpi.kpiLevel === "individual") data.ownerIds = [p.owner];
    }
    if (p.archived === true) data.status = "archived";

    const { count } = await db.kPI.updateMany({ where: { id: b.kpiId, orgId: b.orgId }, data });
    if (count === 0) {
      return NextResponse.json({ success: false, error: "KPI not found in org" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { id: b.kpiId, updated: count } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update KPI";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
