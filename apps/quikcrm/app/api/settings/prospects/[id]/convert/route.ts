import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

/**
 * POST /api/settings/prospects/[id]/convert
 *
 * Marks a prospect as Converted after its Lead has been created client-side
 * (the Convert-to-Lead modal creates the lead via the shared /api/leads flow,
 * then calls this with the new leadId). We deliberately do NOT create the lead
 * here — the lead form owns creation, this just records the link and flips the
 * prospect's status so the list can show it as Converted and stop offering
 * re-conversion.
 *
 * Cookie-session authed (this is an in-app settings action, not the extension).
 * Org-scoped on every query. Idempotent: converting an already-converted
 * prospect keeps the first leadId and returns 200.
 */
const schema = z.object({ leadId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "leadId is required" },
        { status: 400 },
      );
    }
    const { leadId } = parsed.data;

    // The prospect must belong to the caller's org.
    const prospect = await prisma.crmProspect.findFirst({
      where: { id, orgId: user.orgId },
      select: { id: true, status: true, convertedLeadId: true },
    });
    if (!prospect) {
      return NextResponse.json(
        { success: false, error: "Prospect not found" },
        { status: 404 },
      );
    }

    // Idempotent: already converted → return the existing linkage untouched.
    if (prospect.status === "Converted") {
      return NextResponse.json({
        success: true,
        data: { id: prospect.id, status: "Converted", convertedLeadId: prospect.convertedLeadId },
      });
    }

    // The lead must exist in the same org (prevents linking to a foreign/absent lead).
    const lead = await prisma.crmLead.findFirst({
      where: { id: leadId, orgId: user.orgId },
      select: { id: true },
    });
    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Lead not found" },
        { status: 404 },
      );
    }

    const updated = await prisma.crmProspect.update({
      where: { id: prospect.id },
      data: {
        status: "Converted",
        convertedLeadId: lead.id,
        convertedAt: new Date(),
      },
      select: { id: true, status: true, convertedLeadId: true, convertedAt: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    return errorResponse(e);
  }
}
