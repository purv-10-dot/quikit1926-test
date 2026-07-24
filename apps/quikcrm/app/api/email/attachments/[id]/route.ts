/**
 * GET /api/email/attachments/[id]
 *
 * Streams a single email attachment. Bytes are fetched lazily from the provider
 * at download time (we store only metadata) to avoid bloating the DB.
 *
 * Scoped hard: the attachment's message must belong to a mailbox owned by the
 * CURRENT user in THIS org, so a user can never download another user's or
 * another org's attachment.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { getConnection, withFreshToken } from "@/lib/services/email/mailbox";
import { getProvider } from "@/lib/services/email/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "view");

    const { id } = await ctx.params;

    const att = await prisma.crmEmailAttachment.findFirst({
      where: { id, orgId: user.orgId },
      select: {
        filename: true,
        mimeType: true,
        providerAttachmentId: true,
        message: {
          select: { providerMessageId: true, mailboxConnectionId: true },
        },
      },
    });
    if (!att || !att.providerAttachmentId) {
      return NextResponse.json({ success: false, error: "Attachment not found." }, { status: 404 });
    }

    // The mailbox must be the CURRENT user's (own-mailbox-only guarantee).
    const conn = await getConnection(user.orgId, user.userId);
    if (!conn || conn.id !== att.message.mailboxConnectionId) {
      return NextResponse.json({ success: false, error: "Not authorized." }, { status: 403 });
    }

    const provider = getProvider(conn.provider);
    const { contentBase64, mimeType } = await withFreshToken(conn, (pctx) =>
      provider.getAttachment(pctx, {
        providerMessageId: att.message.providerMessageId,
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
