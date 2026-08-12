import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  portalRejectQuote,
  resolvePortalToken,
} from "@/lib/services/quotes/enterprise/portal-service";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().min(1).max(2000) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const resolved = await resolvePortalToken(token);
    if (!resolved) {
      return NextResponse.json({ success: false, error: "Invalid or expired link" }, { status: 404 });
    }
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Reason required" }, { status: 400 });
    }
    await portalRejectQuote({
      orgId: resolved.orgId,
      quoteId: resolved.quoteId,
      reason: parsed.data.reason,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ success: true, data: { rejected: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Reject failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
