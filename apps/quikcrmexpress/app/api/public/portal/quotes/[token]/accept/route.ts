import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  portalAcceptQuote,
  resolvePortalToken,
} from "@/lib/services/quotes/enterprise/portal-service";

export const runtime = "nodejs";

const schema = z.object({ comment: z.string().max(2000).optional() });

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
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    await portalAcceptQuote({
      orgId: resolved.orgId,
      quoteId: resolved.quoteId,
      comment: parsed.success ? parsed.data.comment : undefined,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ success: true, data: { accepted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Accept failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
