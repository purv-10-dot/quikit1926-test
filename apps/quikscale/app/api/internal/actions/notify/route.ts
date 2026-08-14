import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/actions/notify  — service-to-service only.
 *
 * Called by QuikFlow's `notify_owner` action executor to write a real in-app
 * Notification on behalf of an automation. Same auth convention as the other
 * internal routes: shared INTERNAL_SECRET via `x-internal-secret`, explicit
 * orgId + userId in the body (no user session).
 */
const bodySchema = z.object({
  orgId: z.string().min(1),
  userId: z.string().min(1),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  relatedEntityId: z.string().optional().nullable(),
  relatedEntityType: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const b = parsed.data;

  try {
    const created = await db.notification.create({
      data: {
        orgId: b.orgId,
        userId: b.userId,
        title: b.title,
        message: b.message,
        type: "workflow",
        relatedEntityId: b.relatedEntityId ?? null,
        relatedEntityType: b.relatedEntityType ?? null,
        channel: "in_app",
      },
      select: { id: true },
    });
    return NextResponse.json({ success: true, data: { id: created.id } }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create notification";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
