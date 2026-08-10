import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { transitionLeadSchema } from "@/lib/validators/lead";
import {
  LeadTransitionError,
  transitionLead,
} from "@/lib/services/leads/transition-service";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "edit");
    const lead = await prisma.crmLead.findUnique({ where: { id } });
    if (!lead || lead.tenantId !== user.tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (lead.deletedAt) {
      return NextResponse.json(
        { error: "Lead is in trash. Restore it before changing stage." },
        { status: 410 },
      );
    }
    await assertAccountAccess(user, lead.accountId);

    const parsed = transitionLeadSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const updated = await transitionLead({ user, leadId: id, input: parsed.data });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    if (e instanceof LeadTransitionError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    }
    return errorResponse(e);
  }
}
