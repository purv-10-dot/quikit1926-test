import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { publish, LifecycleError } from "@/lib/services/automation/lifecycle";

export const runtime = "nodejs";

/**
 * [P3.A5] Publish a Draft automation (Draft → Active). Thin wrapper over the S1
 * lifecycle service — this route does NOT re-encode the state machine. It is the
 * same `publish()` Track B's B4 hooks, so a publish-time loop block surfaces here
 * automatically (§7.3). Tenant-scoped (Constraint 1.4).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "automations", "edit");

    const wf = await prisma.qcfWorkflowDefinition.findFirst({
      where: { id, orgId: user.orgId, deletedAt: null },
    });
    if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await publish(user.orgId, id);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof LifecycleError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
