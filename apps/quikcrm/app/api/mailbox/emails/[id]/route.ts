/**
 * GET /api/mailbox/emails/[id]
 *
 * Full detail for one mailbox email (subject/from/to/cc/bcc/body/attachments)
 * plus its thread (same providerThreadId). Sanitizes inbound HTML at the
 * boundary. Marks the email read on open. DB-only; own-mailbox scoped.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  callerConnectionId,
  getMailboxEmail,
  markRead,
} from "@/lib/services/email/mailbox-query";
import { sanitizeEmailHtml } from "@/lib/services/email/sanitize-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "mailbox", "view");

    const { id } = await ctx.params;
    const connectionId = await callerConnectionId(user.orgId, user.userId);
    if (!connectionId) {
      return NextResponse.json({ success: false, error: "No connected mailbox." }, { status: 409 });
    }

    const found = await getMailboxEmail(user.orgId, connectionId, id);
    if (!found) {
      return NextResponse.json({ success: false, error: "Email not found." }, { status: 404 });
    }

    // Sanitize inbound bodies (customer-authored HTML) before returning.
    const sanitize = (row: { direction: string; bodyHtml?: string | null }) =>
      row.direction === "inbound" ? sanitizeEmailHtml(row.bodyHtml ?? "") : (row.bodyHtml ?? null);

    const email = { ...found.email, bodyHtml: sanitize(found.email) };
    const thread = found.thread.map((m) => ({ ...m, bodyHtml: sanitize(m) }));

    // Fire-and-forget read flip (don't block the response).
    if (!found.email.isRead) void markRead(user.orgId, connectionId, id).catch(() => {});

    return NextResponse.json({ success: true, data: { email, thread } });
  } catch (e) {
    return errorResponse(e);
  }
}
