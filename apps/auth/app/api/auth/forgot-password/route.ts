import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendPasswordResetOtpEmail } from "@/lib/email";
import {
  generateOtp,
  hashOtp,
  storeOtp,
  OTP_TTL_SECONDS,
} from "@/lib/otp-store";
import { rateLimitAsync, getClientIp } from "@quikit/shared/rateLimit";
import { withCors, preflight } from "@/lib/cors";

/**
 * POST /api/auth/forgot-password
 *
 * Generates a 6-digit OTP, stores its sha256 hash in Redis under
 * `otp:reset:<userId>` (TTL = 3 min), and emails the OTP to the user.
 *
 * Anti-enumeration: the response is always `{ success: true, expiresInSeconds }`
 * regardless of whether the email exists, so a caller cannot probe the user
 * table by checking the response.
 *
 * Rate-limited per email and per IP — see `rateLimitAsync` calls below.
 */

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const FAIL_CLOSED = process.env.NODE_ENV === "production";

async function postHandler(req: NextRequest) {
  // Always end with this shape so callers can start a 3-min countdown timer
  // regardless of whether the email mapped to a real user. The timer is the
  // anti-enumeration cover.
  const successPayload = { success: true, expiresInSeconds: OTP_TTL_SECONDS };

  try {
    let parsed: { email: string } | null = null;
    try {
      const result = Body.safeParse(await req.json());
      if (result.success) parsed = result.data;
    } catch {
      // Fall through — silent-success
    }
    if (!parsed) {
      return NextResponse.json(successPayload);
    }

    // Per-IP throttle first (cheaper, before DB hit). Limits a credential-stuffer
    // who is rotating through email lists.
    const ipRl = await rateLimitAsync({
      routeKey: "auth:forgot-password:ip",
      clientKey: getClientIp(req),
      limit: 10,
      windowMs: 15 * 60 * 1000,
      failClosed: FAIL_CLOSED,
    });
    if (!ipRl.ok) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Try again later." },
        { status: 429, headers: { "retry-after": String(ipRl.retryAfterSeconds) } },
      );
    }

    // Per-email throttle: stops an attacker from spamming a known user's inbox.
    const emailRl = await rateLimitAsync({
      routeKey: "auth:forgot-password:email",
      clientKey: parsed.email,
      limit: 3,
      windowMs: 15 * 60 * 1000,
      failClosed: FAIL_CLOSED,
    });
    if (!emailRl.ok) {
      // Still return success to preserve anti-enumeration. The cooldown is
      // enforced silently — a real user who hits this just won't receive the
      // new email; their old code is still valid (or expired).
      return NextResponse.json(successPayload);
    }

    const user = await db.user.findUnique({
      where: { email: parsed.email },
      select: { id: true, email: true },
    });

    if (user) {
      const otp = generateOtp();
      await storeOtp(user.id, hashOtp(otp));
      try {
        await sendPasswordResetOtpEmail({ to: user.email, otp });
      } catch (err) {
        console.error("[forgot-password] email send failed:", err);
      }
    }

    return NextResponse.json(successPayload);
  } catch (error: unknown) {
    // Anti-enumeration: do NOT change the response shape on internal errors,
    // an attacker would otherwise probe the user table by inspecting timing
    // / response delta. Log loudly server-side, return success to the client.
    console.error("[forgot-password] unexpected error:", error);
    return NextResponse.json(successPayload);
  }
}

export const POST = withCors(postHandler);
export function OPTIONS(req: NextRequest) {
  return preflight(req);
}
