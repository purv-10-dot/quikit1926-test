import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/actions/update-record — service-to-service only.
 *
 * Generic, WHITELISTED record mutation for QuikFlow actions (priority.complete,
 * www.complete, priority.reassign, …). Only status/owner on Priority / WWW /
 * Goal — deliberately NOT KPI, whose RAG is derived (writing it would corrupt
 * the traffic-light semantics). Org-scoped via updateMany(where:{id,orgId}).
 * Shared INTERNAL_SECRET auth, explicit orgId/actorId (mirrors create-priority).
 */
const bodySchema = z.object({
  orgId: z.string().min(1),
  actorId: z.string().min(1),
  module: z.enum(["priority", "www", "goal"]),
  recordId: z.string().min(1),
  patch: z
    .object({ status: z.string().min(1).optional(), owner: z.string().min(1).optional() })
    .refine((p) => p.status !== undefined || p.owner !== undefined, "patch must set status or owner"),
});

/** Per-module column whitelist — the ONLY columns this endpoint may touch. */
const COLUMNS = {
  priority: { statusCol: "overallStatus", ownerCol: "owner" },
  www: { statusCol: "status", ownerCol: "who" },
  goal: { statusCol: "status", ownerCol: "ownerId" },
} as const;

function buildData(module: keyof typeof COLUMNS, patch: { status?: string; owner?: string }, actorId: string) {
  const cols = COLUMNS[module];
  const data: Record<string, unknown> = { updatedBy: actorId };
  if (patch.status !== undefined) data[cols.statusCol] = patch.status;
  if (patch.owner !== undefined) data[cols.ownerCol] = patch.owner;
  return data;
}

async function applyUpdate(module: keyof typeof COLUMNS, where: { id: string; orgId: string }, data: Record<string, unknown>) {
  // Concrete delegates (typed) rather than dynamic indexing.
  switch (module) {
    case "priority":
      return db.priority.updateMany({ where, data });
    case "www":
      return db.wWWItem.updateMany({ where, data });
    case "goal":
      return db.goal.updateMany({ where, data });
  }
}

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
    const data = buildData(b.module, b.patch, b.actorId);
    const { count } = await applyUpdate(b.module, { id: b.recordId, orgId: b.orgId }, data);
    if (count === 0) {
      return NextResponse.json({ success: false, error: "Record not found in org" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { id: b.recordId, updated: count } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update record";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
