/**
 * POST /api/notifications/debug/test
 *
 * Directly create a test notification, bypassing all business-logic guards
 * (self-notification suppression, actor = owner checks, etc.).
 *
 * Useful for verifying that:
 *   1. The CrmNotification DB write works.
 *   2. The Redis SSE publish fires correctly.
 *   3. Email delivery is configured.
 *   4. The recipient's bell badge updates in real-time.
 *
 * Admin-only.
 *
 * Body: {
 *   userId: string         — recipient user ID
 *   type: NotificationType
 *   title: string
 *   body: string
 *   link?: string          — optional relative URL, e.g. "/leads/abc"
 *   skipEmail?: boolean    — skip email delivery (default false)
 * }
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { isAdminRole } from "@/lib/auth/role-grants";
import { createNotification } from "@/lib/notifications/service";

export const runtime = "nodejs";

const testSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(["lead_assigned", "lead_stage_changed", "lead_converted", "lead_reassigned"]),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  link: z.string().optional(),
  skipEmail: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (!isAdminRole(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = testSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { userId, type, title, body, link, skipEmail } = parsed.data;

    await createNotification({
      tenantId: user.tenantId,
      userId,
      type,
      category: "lead",
      title,
      body,
      link: link ?? `/leads`,
      skipEmail,
      metadata: {
        debug: true,
        sentByUserId: user.userId,
        sentByEmail: user.email,
        sentAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      ok: true,
      message: `Test notification sent to user ${userId}.`,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
