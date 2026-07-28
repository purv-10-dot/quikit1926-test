import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { sendMailForOrg, getFathomKey, FATHOM_PROVIDER_ID } from "@/lib/connectors";
import { validateKey } from "@/lib/connectors/fathom";

export const runtime = "nodejs";

/**
 * POST /api/connections/test { id } — send a test email from a connected mailbox
 * to itself, so an admin can verify the whole outbound path in one click (the
 * Zapier-style "Test connection"). Org-scoped; App Admin only.
 */
export const POST = withOrgAuth(
  async ({ orgId }, req: NextRequest) => {
    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    const id = body?.id;
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing connection id" }, { status: 400 });
    }
    const conn = await db.wfConnection.findFirst({
      where: { id, orgId },
      select: { id: true, label: true, provider: true },
    });
    if (!conn) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    // Fathom is an API-key notetaker (not a mailbox): "test" = re-validate the key.
    if (conn.provider === FATHOM_PROVIDER_ID) {
      const key = await getFathomKey(orgId);
      if (!key) {
        return NextResponse.json({ success: false, error: "No Fathom key stored" }, { status: 400 });
      }
      const check = await validateKey(key.apiKey);
      if (!check.ok) {
        return NextResponse.json({ success: false, error: check.error ?? "Fathom key invalid" }, { status: 502 });
      }
      return NextResponse.json({ success: true, data: { ok: true, provider: conn.provider, label: conn.label } });
    }

    try {
      const sent = await sendMailForOrg(
        orgId,
        null,
        {
          to: conn.label,
          subject: "QuikFlow test email ✅",
          body: `This is a test email from your connected ${conn.provider} account (${conn.label}) via QuikFlow.\n\nIf you received this, outbound email is working.`,
        },
        { connectionId: conn.id },
      );
      if (!sent) {
        return NextResponse.json({ success: false, error: "Send skipped — mailbox not connected" }, { status: 400 });
      }
      return NextResponse.json({ success: true, data: { sent: true, messageId: sent.id, to: conn.label } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Test send failed";
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }
  },
  // Any org member may test a connected mailbox (org-scoped).
);
