import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  QuoteApprovalError,
  decideQuoteApproval,
} from "@/lib/services/quotes/enterprise/approval-service";

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
    await decideQuoteApproval({
      tenantId: user.tenantId,
      quoteId: id,
      approvalId: parsed.data.approvalId,
      decision: parsed.data.decision,
      userId: user.userId,
      userName: user.name ?? null,
      notes: parsed.data.notes ?? null,
    });
    return NextResponse.json({ success: true, data: { decided: parsed.data.decision } });
  } catch (error: unknown) {
    const status = error instanceof QuoteApprovalError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Decision failed";
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
