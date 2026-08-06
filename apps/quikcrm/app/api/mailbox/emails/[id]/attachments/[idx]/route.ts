/**
 * GET /api/mailbox/emails/[id]/attachments/[idx]
 *
 * Lazily downloads the idx-th attachment of a mailbox email straight from the
 * provider (metadata is mirrored; bytes are fetched on demand). Own-mailbox
 * scoped: the email must belong to the caller's connection.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { getConnection, withFreshToken } from "@/lib/services/email/mailbox";
import { getProvider } from "@/lib/services/email/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StoredAttachment {
  filename: string;
  mimeType?: string | null;
  providerAttachmentId?: string;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; idx: string }> },
) {
  try {
    // Personal mailbox: authentication is the only gate. The email lookup below
    // is pinned to the caller's own connection id.
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const { id, idx } = await ctx.params;
    const conn = await getConnection(user.orgId, user.userId);
    if (!conn || conn.status === "disconnected") {
      return NextResponse.json({ success: false, error: "No connected mailbox." }, { status: 409 });
    }

    const email = await prisma.crmMailboxEmail.findFirst({
      where: { id, orgId: user.orgId, mailboxConnectionId: conn.id },
      select: { providerMessageId: true, attachments: true },
    });
    if (!email) {
      return NextResponse.json({ success: false, error: "Email not found." }, { status: 404 });
    }

    const list = (email.attachments as unknown as StoredAttachment[] | null) ?? [];
    const att = list[Number(idx)];
    if (!att || !att.providerAttachmentId) {
      return NextResponse.json({ success: false, error: "Attachment not found." }, { status: 404 });
    }

    const provider = getProvider(conn.provider);
    const { contentBase64, mimeType } = await withFreshToken(conn, (pctx) =>
      provider.getAttachment(pctx, {
        providerMessageId: email.providerMessageId,
        providerAttachmentId: att.providerAttachmentId as string,
      }),
    );

    const bytes = Buffer.from(contentBase64, "base64");
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type": mimeType ?? att.mimeType ?? "application/octet-stream",
        "content-disposition": `attachment; filename="${att.filename.replace(/"/g, "")}"`,
        "content-length": String(bytes.length),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
