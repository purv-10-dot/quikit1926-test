import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

const createSchema = z.object({
  leadId: z.string().min(1).optional().nullable(),
  callLogId: z.string().min(1).optional().nullable(),
  amount: z.number().nonnegative(),
  currency: z.string().min(1).default("INR"),
  reference: z.string().optional().nullable(),
  paymentMode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { leadId, callLogId, amount, currency, reference, paymentMode, notes } = parsed.data;

    if (leadId) {
      const lead = await prisma.crmLead.findFirst({
        where: { id: leadId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    if (callLogId) {
      const cl = await prisma.crmCallLog.findFirst({
        where: { id: callLogId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!cl) return NextResponse.json({ error: "Call log not found" }, { status: 404 });
    }

    const row = await prisma.crmPaymentVerification.create({
      data: {
        tenantId: user.tenantId,
        leadId: leadId ?? null,
        callLogId: callLogId ?? null,
        amount,
        currency,
        status: "Pending",
        metadata: {
          reference: reference ?? null,
          paymentMode: paymentMode ?? null,
          notes: notes ?? null,
          submittedBy: user.userId,
          submittedAt: new Date().toISOString(),
        },
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
