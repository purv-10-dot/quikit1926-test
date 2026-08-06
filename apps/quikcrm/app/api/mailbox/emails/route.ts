/**
 * GET /api/mailbox/emails?folder=&page=&pageSize=&q=&isRead=&hasAttachment=
 *
 * Paginated mailbox list, read from CrmMailboxEmail (the local mirror) ONLY —
 * never calls the provider. Scoped to the caller's own connection.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import {
  callerConnection,
  listMailboxEmails,
  type MailboxFolder,
} from "@/lib/services/email/mailbox-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FOLDERS: MailboxFolder[] = ["inbox", "sent", "drafts", "all"];

export async function GET(req: NextRequest) {
  try {
    // Personal mailbox: authentication is the only gate. Every row below is
    // filtered by the caller's own connection id, so there is nothing an
    // org-level `mailbox` grant would additionally protect.
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const sp = new URL(req.url).searchParams;
    const folder = (sp.get("folder") ?? "inbox") as MailboxFolder;
    if (!FOLDERS.includes(folder)) {
      return NextResponse.json({ success: false, error: "Invalid folder." }, { status: 400 });
    }
    const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") ?? "25") || 25));
    const isReadParam = sp.get("isRead");

    const connection = await callerConnection(user.orgId, user.userId);
    if (!connection) {
      // No mailbox connected — empty result (UI shows a Connect CTA).
      return NextResponse.json({
        success: true,
        data: { items: [], total: 0, page, pageSize, totalPages: 1, connected: false },
      });
    }

    const result = await listMailboxEmails(
      user.orgId,
      connection.id,
      {
        folder,
        page,
        pageSize,
        q: sp.get("q") ?? undefined,
        isRead: isReadParam === null ? undefined : isReadParam === "true",
        hasAttachment: sp.get("hasAttachment") === "true",
      },
      connection.provider,
    );

    return NextResponse.json({ success: true, data: { ...result, connected: true } });
  } catch (e) {
    return errorResponse(e);
  }
}
