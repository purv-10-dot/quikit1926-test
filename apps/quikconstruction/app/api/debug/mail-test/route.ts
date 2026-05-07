import { NextRequest, NextResponse } from "next/server";
import { sendMail, getMailerDiagnostics } from "@/lib/email/mailer";

/**
 * GET  /api/debug/mail-test            — returns mailer diagnostics
 *                                        (which transport, what env vars,
 *                                        what the resolved From is).
 * GET  /api/debug/mail-test?to=you@x   — sends a test email to `to` and
 *                                        returns the same diagnostics
 *                                        plus the send result.
 *
 * Dev-only escape hatch so you can verify the SMTP wiring without
 * creating a real user. Hit it directly in the browser:
 *
 *   http://localhost:3010/api/debug/mail-test
 *   http://localhost:3010/api/debug/mail-test?to=tikarebhavna792@gmail.com
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const to = searchParams.get("to");

  const diagnostics = getMailerDiagnostics();

  if (!to) {
    return NextResponse.json({
      ...diagnostics,
      hint:
        "Add ?to=your@email to actually send a test. " +
        "If `transport` is 'file-outbox' here, your .env changes haven't " +
        "been loaded — STOP and RESTART the dev server (Ctrl+C then pnpm dev).",
    });
  }

  const html = `
    <h2>QuikConstruction mailer test</h2>
    <p>If you're reading this in your inbox, the SMTP transport is working.</p>
    <p>Transport: <b>${diagnostics.transport}</b></p>
    <p>Host: <code>${diagnostics.smtp?.host ?? "(none)"}</code></p>
    <p>Sent at: ${new Date().toISOString()}</p>
  `;

  const result = await sendMail({
    to,
    subject: "QuikConstruction SMTP test",
    html,
  });

  return NextResponse.json({ ...diagnostics, result });
}
