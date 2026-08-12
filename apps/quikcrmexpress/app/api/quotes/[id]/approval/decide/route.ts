import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  QuoteApprovalError,
  decideQuoteApproval,
} from "@/lib/services/quotes/enterprise/approval-service";
import { prisma } from "@/lib/db/prisma";
import {
  notifyQuoteApproved,
  notifyQuoteRejected,
} from "@/lib/notifications/quote-triggers";

export const runtime = "nodejs";

const schema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["Approved", "Rejected"]),
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
    }
    // Fetch approval record BEFORE deciding so we have the requester's ID.
    const approval = await prisma.qceQuoteApproval.findFirst({
      where: { id: parsed.data.approvalId, quoteId: id, orgId: user.orgId },
      select: {
        requestedById: true,
        requestedByName: true,
        quote: { select: { quoteNumber: true, ownerId: true } },
      },
    });

    await decideQuoteApproval({
      orgId: user.orgId,
      quoteId: id,
      approvalId: parsed.data.approvalId,
      decision: parsed.data.decision,
      userId: user.userId,
      userName: user.name ?? null,
      notes: parsed.data.notes ?? null,
    });

    // Notify the person who requested approval about the outcome.
    const quoteNum = String(approval?.quote?.quoteNumber ?? id);
    const requestedById = approval?.requestedById ?? approval?.quote?.ownerId ?? null;
    const triggerFn =
      parsed.data.decision === "Approved" ? notifyQuoteApproved : notifyQuoteRejected;
    triggerFn({
      orgId: user.orgId,
      quoteId: id,
      quoteNumber: quoteNum,
      requestedById,
      approverName: user.name || user.email,
      notes: parsed.data.notes ?? null,
    }).catch((e) =>
      console.error("[notifications] quote approval decision", e),
    );

    return NextResponse.json({ success: true, data: { decided: parsed.data.decision } });
  } catch (error: unknown) {
    const status = error instanceof QuoteApprovalError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Decision failed";
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
