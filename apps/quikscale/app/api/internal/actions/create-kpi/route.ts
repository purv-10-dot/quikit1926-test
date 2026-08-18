import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/actions/create-kpi — service-to-service only.
 *
 * Called by QuikFlow's `kpi.create` executor. Creates an INDIVIDUAL KPI on
 * behalf of an automation. Derived fields (progressPercent / qtdAchieved /
 * healthStatus) are left to their model defaults and recomputed once weekly
 * values are entered — the automation never sets them. Same auth convention as
 * the sibling internal routes.
 */
const bodySchema = z.object({
  orgId: z.string().min(1),
  actorId: z.string().min(1),
  name: z.string().min(1).max(200),
  owner: z.string().min(1),
  target: z.number().nullable().optional(),
  measurementUnit: z.string().min(1).max(60).default("Number"),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]).default("Q1"),
  year: z.number().int().min(2020).max(2099),
  frequency: z.string().min(1).max(30).default("weekly"),
  kpiType: z.string().min(1).max(30).default("NA"),
  divisionType: z.string().min(1).max(30).default("Cumulative"),
  teamId: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
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
    const created = await db.kPI.create({
      data: {
        orgId: b.orgId,
        name: b.name,
        description: b.description ?? null,
        kpiLevel: "individual",
        owner: b.owner,
        ownerIds: [b.owner],
        teamId: b.teamId ?? null,
        quarter: b.quarter,
        year: b.year,
        measurementUnit: b.measurementUnit,
        target: b.target ?? null,
        qtdGoal: b.target ?? null,
        divisionType: b.divisionType,
        frequency: b.frequency,
        kpiType: b.kpiType,
        status: "active",
        createdBy: b.actorId,
      },
      select: { id: true },
    });
    return NextResponse.json({ success: true, data: { id: created.id } }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create KPI";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
