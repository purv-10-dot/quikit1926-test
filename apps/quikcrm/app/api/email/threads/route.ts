/**
 * GET /api/email/threads?relatedKind=Lead&relatedObjectId=xxx
 *
 * Returns the email threads (with messages) for a specific CRM record, for the
 * Emails tab / conversation view. Org-scoped; gated on activities:view.
 *
 * Note: threads are visible to any user with activities:view on the record —
 * email conversations belong to the RECORD, not just the sender — but sending
 * still requires the viewer's own connected mailbox.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { isPrimaryKind } from "@/lib/services/activities/target-existence";
import { sanitizeEmailHtml } from "@/lib/services/email/sanitize-html";
import { resolveThreadScope } from "@/lib/services/email/record-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "view");

    const url = new URL(req.url);
    const relatedKind = url.searchParams.get("relatedKind") ?? "";
    const relatedObjectId = url.searchParams.get("relatedObjectId") ?? "";
    if (!isPrimaryKind(relatedKind) || !relatedObjectId) {
      return NextResponse.json(
        { success: false, error: "relatedKind and relatedObjectId are required." },
        { status: 400 },
      );
    }

    // Account/Opportunity tabs roll up the threads of their linked leads/contacts
    // (messages are stored against the person; the account/opp surfaces them).
    const scope = await resolveThreadScope(user.orgId, relatedKind, relatedObjectId);

    const threads = await prisma.crmEmailThread.findMany({
      where: { orgId: user.orgId, OR: scope },
      orderBy: { lastMessageAt: "desc" },
      select: {
        id: true,
        subject: true,
        lastMessageAt: true,
        messageCount: true,
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            direction: true,
            fromAddress: true,
            toAddresses: true,
            ccAddresses: true,
            subject: true,
            snippet: true,
            bodyHtml: true,
            bodyText: true,
            sentAt: true,
            receivedAt: true,
            createdAt: true,
            attachments: {
              select: { id: true, filename: true, mimeType: true, sizeBytes: true },
            },
          },
        },
      },
    });

    // Sanitize inbound HTML at the boundary so the client never receives
    // untrusted markup (defense against stored XSS from customer replies).
    const safeThreads = threads.map((t) => ({
      ...t,
      messages: t.messages.map((m) => ({
        ...m,
        bodyHtml: m.direction === "inbound" ? sanitizeEmailHtml(m.bodyHtml) : m.bodyHtml,
      })),
    }));

    return NextResponse.json({ success: true, data: { threads: safeThreads } });
  } catch (e) {
    return errorResponse(e);
  }
}
