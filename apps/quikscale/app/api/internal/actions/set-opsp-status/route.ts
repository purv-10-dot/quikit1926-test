import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { emitOpspStatusChanged } from "@/lib/services/workflowEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/actions/set-opsp-status — service-to-service only.
 *
 * Backs QuikFlow's `opsp.finalize` (→ finalized) and `opsp.review.mark`
 * (→ reviewed) executors. The OPSP lifecycle is a forward-only state machine
 * draft → finalized → reviewed; this endpoint only advances it (never backward)
 * and emits the same `emitOpspStatusChanged` signal the UI path uses so
 * downstream workflows fire. It does NOT touch section content — see the
 * (still-simulated) opsp.update.section action for that. Org-scoped.
 */
const RANK: Record<string, number> = { draft: 0, finalized: 1, reviewed: 2 };

const bodySchema = z.object({
  orgId: z.string().min(1),
  actorId: z.string().min(1),
  opspId: z.string().min(1),
  target: z.enum(["finalized", "reviewed"]),
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
    const opsp = await db.oPSPData.findFirst({
      where: { id: b.opspId, orgId: b.orgId },
      select: { status: true, userId: true, quarter: true, year: true },
    });
    if (!opsp) {
      return NextResponse.json({ success: false, error: "OPSP not found in org" }, { status: 404 });
    }

    const current = opsp.status ?? "draft";
    // Forward-only: refuse to move to an equal/earlier stage (idempotent no-move).
    if ((RANK[b.target] ?? 0) <= (RANK[current] ?? 0)) {
      return NextResponse.json(
        { success: false, error: `OPSP is already '${current}' — cannot move to '${b.target}'.` },
        { status: 409 },
      );
    }

    await db.oPSPData.updateMany({
      where: { id: b.opspId, orgId: b.orgId },
      data: { status: b.target },
    });

    // Fire-and-forget downstream signal (opsp.stage.changed + finalized/reviewed).
    emitOpspStatusChanged({
      orgId: b.orgId,
      opspId: b.opspId,
      owner: opsp.userId,
      quarter: opsp.quarter,
      year: opsp.year,
      before: current,
      after: b.target,
    });

    return NextResponse.json({ success: true, data: { id: b.opspId, status: b.target } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to set OPSP status";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
