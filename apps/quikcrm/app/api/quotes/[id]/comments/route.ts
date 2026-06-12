import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  addQuoteComment,
  listQuoteComments,
} from "@/lib/services/quotes/enterprise/collaboration-service";

export const runtime = "nodejs";

const postSchema = z.object({
  body: z.string().min(1).max(4000),
  mentions: z.array(z.string()).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const data = await listQuoteComments(user.orgId, id);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list comments";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

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
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
    }
    const data = await addQuoteComment({
      orgId: user.orgId,
      quoteId: id,
      body: parsed.data.body,
      authorId: user.userId,
      authorName: user.name ?? null,
      mentions: parsed.data.mentions,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Comment failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
