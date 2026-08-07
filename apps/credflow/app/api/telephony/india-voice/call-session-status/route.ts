// apps/quikcrm/app/api/telephony/india-voice/call-session-status/route.ts
/**
 * Polled by the dialer every 2s while a call is in progress. Returns the
 * latest known IndiaVoice webhook event for a given callSid/campid, plus a
 * boolean that the client uses to decide when to open the disposition modal.
 *
 * `callEnded` is true if any of:
 *   - endTime is set
 *   - callRecordingUrl is set
 *   - callDurationSec > 0
 *   - status matches answer/busy/cancel/abandonment/no_answer/failed
 *
 * Tenant-scoped: only the caller's own tenant rows are visible.
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDED_STATUS_RE = /answer|busy|cancel|abandonment|no_answer|failed/i;

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const { searchParams } = new URL(req.url);
    const callSid = (searchParams.get("callSid") || "").trim();
    if (!callSid) {
      return NextResponse.json({ error: "callSid is required" }, { status: 400 });
    }

    const row = await prisma.qcfIndiaVoiceWebhookLog.findFirst({
      where: {
        tenantId: user.tenantId,
        OR: [{ callSid }, { campid: callSid }],
      },
      orderBy: { createdAt: "desc" },
    });

    if (!row) {
      return NextResponse.json({
        found: false,
        callSid: null,
        campid: null,
        status: null,
        callEnded: false,
        duration: 0,
        recordingUrl: null,
      });
    }

    const callEnded =
      !!row.endTime ||
      !!row.callRecordingUrl ||
      (row.callDurationSec ?? 0) > 0 ||
      (!!row.status && ENDED_STATUS_RE.test(row.status));

    return NextResponse.json({
      found: true,
      callSid: row.callSid,
      campid: row.campid,
      status: row.status,
      callEnded,
      duration: row.callDurationSec ?? row.talkDurationSec ?? 0,
      recordingUrl: row.callRecordingUrl,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
