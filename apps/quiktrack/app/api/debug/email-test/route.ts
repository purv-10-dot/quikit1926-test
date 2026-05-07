import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { sendEmail } from "@/lib/email/sendEmail";

/**
 * Dev-only probe to confirm SMTP is wired correctly.
 *   GET /api/debug/email-test?to=you@example.com
 *
 * Returns the env config it sees (without the password) and whether sendMail
 * threw. Behind tenant auth so randoms can't spam your SMTP from prod.
 * Disabled in production unless explicitly opted-in.
 */
export const GET = withOrgAuth(async (_ctx, req: NextRequest) => {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_EMAIL_DEBUG !== "true") {
    return NextResponse.json({ success: false, error: "Disabled in production" }, { status: 403 });
  }

  const to = req.nextUrl.searchParams.get("to");
  if (!to) {
    return NextResponse.json(
      { success: false, error: "Pass ?to=email@example.com" },
      { status: 400 },
    );
  }

  // Surface enough about the password to spot env-loading issues (length,
  // first/last 2 chars) without leaking the actual value into the response.
  const pass = process.env.SMTP_PASS ?? "";
  const cfg = {
    SMTP_HOST: process.env.SMTP_HOST ?? null,
    SMTP_PORT: process.env.SMTP_PORT ?? null,
    SMTP_USER: process.env.SMTP_USER ?? null,
    SMTP_PASS_set: Boolean(pass),
    SMTP_PASS_length: pass.length,
    SMTP_PASS_hint: pass.length >= 4 ? `${pass.slice(0, 2)}…${pass.slice(-2)}` : null,
    MAIL_FROM: process.env.MAIL_FROM ?? null,
  };

  // Now surfaces the actual SMTP result instead of always returning success
  // — so the JSON tells you whether Office 365 / Gmail / SES accepted the
  // message, with the exact rejection reason if not.
  const result = await sendEmail({
    to,
    subject: "QuikTrack SMTP test",
    html: `<p>This is a test email from QuikTrack.</p><p>If you received this, SMTP is wired correctly.</p>`,
  });

  return NextResponse.json({
    success: result.ok,
    cfg,
    sent: result.ok ? { messageId: result.messageId } : null,
    error: result.error ?? null,
    skipped: result.skipped ?? false,
  });
});
