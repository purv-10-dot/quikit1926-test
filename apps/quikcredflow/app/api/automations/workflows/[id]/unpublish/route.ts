import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { unpublish, LifecycleError } from "@/lib/services/automation/lifecycle";

export const runtime = "nodejs";

const schema = z.object({ mode: z.enum(["immediate", "delayed"]) });

/**
 * [P3.A5] Unpublish an Active automation via the S1 lifecycle service:
 *   immediate → Stopped   (halts in-flight leads at once)
 *   delayed   → Draining  (admits no new leads; in-flight leads finish)
 * Does NOT re-encode the state machine. Tenant-scoped (Constraint 1.4).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "automations", "edit");

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid mode" }, { status: 400 });

    const wf = await prisma.qcfWorkflowDefinition.findFirst({
      where: { id, orgId: user.orgId, deletedAt: null },
    });
    if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await unpublish(user.orgId, id, parsed.data.mode);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof LifecycleError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
