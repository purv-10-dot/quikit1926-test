import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/actions/update-priority — service-to-service only.
 *
 * Called by QuikFlow's `priority.update` executor. Whitelisted Rock fields only
 * (name / description / status / owner / notes); `progressPct` and `dueDate` are
 * derived and never written. Org-scoped via updateMany(where:{id,orgId}). Same
 * INTERNAL_SECRET convention as the sibling internal routes.
 */
const bodySchema = z.object({
  orgId: z.string().min(1),
  actorId: z.string().min(1),
  priorityId: z.string().min(1),
  patch: z
    .object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).nullable().optional(),
      status: z.string().min(1).max(40).optional(),
      owner: z.string().min(1).optional(),
      notes: z.string().max(2000).nullable().optional(),
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
    const data: Record<string, unknown> = { updatedBy: b.actorId };
    if (p.name !== undefined) data.name = p.name;
    if (p.description !== undefined) data.description = p.description;
    if (p.status !== undefined) data.overallStatus = p.status;
    if (p.owner !== undefined) data.owner = p.owner;
    if (p.notes !== undefined) data.notes = p.notes;

    const { count } = await db.priority.updateMany({ where: { id: b.priorityId, orgId: b.orgId }, data });
    if (count === 0) {
      return NextResponse.json({ success: false, error: "Priority not found in org" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { id: b.priorityId, updated: count } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update priority";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
