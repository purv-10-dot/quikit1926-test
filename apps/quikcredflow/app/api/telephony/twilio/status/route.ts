// apps/quikcredflow/app/api/telephony/twilio/status/route.ts
/**
 * Reports whether the telephony provider env vars are wired up. The dialer
 * page calls this on mount to decide whether to render the call button or a
 * "telephony not configured" banner. The endpoint name says "twilio" for
 * historical reasons; the actual provider check is on IndiaVoice (RP Digital).
 */
import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { isConfigured } from "@/lib/services/telephony/india-voice";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    return NextResponse.json({ configured: isConfigured() });
  } catch (e) {
    return errorResponse(e);
  }
}
