/**
 * Send a salesperson performance report email with a PDF attachment.
 *
 * Transport selection (in priority order):
 *
 *   1. SMTP (Office365 / any SMTP)
 *      Set:  SMTP_HOST  SMTP_PORT  SMTP_USER  SMTP_PASS  SMTP_FROM
 *      Requires nodemailer installed:
 *        npm i nodemailer @types/nodemailer --workspace=apps/quikcrm
 *
 *   2. Resend  (EMAIL_PROVIDER=resend + RESEND_API_KEY)
 *      Supports attachments via Resend's attachment field.
 *
 *   3. Console (default dev fallback)
 *      Logs the email content to stdout; PDF attachment is not sent.
 */

export interface ReportEmailArgs {
  to: string[];
  subject: string;
  /** Plain-text message body. */
  text: string;
  /** Optional HTML version. */
  html?: string;
  /** PDF attachment buffer. */
  attachment: {
    filename: string;
    content: Buffer;
  };
}

export interface ReportEmailResult {
  driver: "smtp" | "resend" | "console";
  messageId: string;
  sentAt: Date;
}

// ── Startup diagnostic ────────────────────────────────────────────────────────
// Printed once when this module is first imported. Confirms SMTP env presence
// in the quikcrm process without exposing secret values.
console.info("[SMTP CHECK]", {
  host: !!process.env.SMTP_HOST,
  port: process.env.SMTP_PORT ?? "587 (default)",
  user: !!process.env.SMTP_USER,
  pass: !!process.env.SMTP_PASS,
  from: !!process.env.SMTP_FROM,
});

// ─── Transport: SMTP (nodemailer) ─────────────────────────────────────────────

function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS,
  );
}

async function smtpDriver(args: ReportEmailArgs): Promise<ReportEmailResult> {
  console.info("[send-report:smtp] Attempting SMTP delivery", {
    host:    process.env.SMTP_HOST,
    port:    process.env.SMTP_PORT ?? "587",
    user:    process.env.SMTP_USER,
    from:    process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to:      args.to,
    subject: args.subject,
    hasPass: Boolean(process.env.SMTP_PASS),
  });

  // nodemailer@7 is CJS. When loaded via ESM dynamic import() in the Next.js
  // Node runtime, the CJS module.exports lands on `.default`. We try both
  // shapes so the code works regardless of bundler ESM/CJS interop behaviour.
  type NM = {
    createTransport: (
      opts: Record<string, unknown>,
    ) => {
      sendMail: (opts: Record<string, unknown>) => Promise<{
        messageId: string;
        accepted:  string[];
        rejected:  string[];
        response:  string;
      }>;
    };
  };

  let nm: NM;
  try {
    const raw: unknown = await (import("nodemailer") as Promise<unknown>);
    // CJS via ESM interop: module.exports → raw.default
    const candidate = (raw as { default?: NM }).default ?? (raw as NM);
    if (typeof candidate?.createTransport !== "function") {
      throw new Error("nodemailer.createTransport is not a function — unexpected module shape");
    }
    nm = candidate;
    console.info("[send-report:smtp] nodemailer loaded (transitive dep of next-auth)");
  } catch (importErr) {
    console.error("[send-report:smtp] Failed to load nodemailer:", importErr);
    return consoleDriver(args);
  }

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@example.com";

  const transport = nm.createTransport({
    host:   process.env.SMTP_HOST as string,
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: {
      user: process.env.SMTP_USER as string,
      pass: process.env.SMTP_PASS as string,
    },
    tls: { rejectUnauthorized: false },
  });

  let result: { messageId: string; accepted: string[]; rejected: string[]; response: string };
  try {
    result = await transport.sendMail({
      from,
      to: args.to.join(", "),
      subject: args.subject,
      text: args.text,
      ...(args.html ? { html: args.html } : {}),
      attachments: [
        {
          filename: args.attachment.filename,
          content: args.attachment.content,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (sendErr) {
    console.error("[send-report:smtp] sendMail() threw an error:", sendErr);
    throw sendErr;
  }

  // ── SMTP Result diagnostic log ───────────────────────────────────────────
  console.info("[send-report:smtp] SMTP Result", {
    messageId:  result.messageId,
    accepted:   result.accepted,    // addresses accepted by the SMTP server
    rejected:   result.rejected,    // addresses rejected by the SMTP server
    response:   result.response,    // raw SMTP server response string (e.g. "250 OK")
  });

  if (result.rejected.length > 0) {
    console.warn("[send-report:smtp] Recipient(s) rejected by SMTP server:", result.rejected);
  }

  return {
    driver: "smtp",
    messageId: result.messageId,
    sentAt: new Date(),
  };
}

// ─── Transport: Resend ────────────────────────────────────────────────────────

function isResendConfigured(): boolean {
  return (
    (process.env.EMAIL_PROVIDER ?? "").toLowerCase() === "resend" &&
    Boolean(process.env.RESEND_API_KEY)
  );
}

async function resendDriver(args: ReportEmailArgs): Promise<ReportEmailResult> {
  const apiKey = process.env.RESEND_API_KEY!;
  const from =
    process.env.EMAIL_FROM ??
    process.env.SMTP_FROM ??
    "QuikCRM <noreply@example.test>";

  // Resend REST API — avoids SDK dependency.
  const body: Record<string, unknown> = {
    from,
    to: args.to,
    subject: args.subject,
    text: args.text,
    ...(args.html ? { html: args.html } : {}),
    attachments: [
      {
        filename: args.attachment.filename,
        // Resend expects base64-encoded string for content.
        content: args.attachment.content.toString("base64"),
      },
    ],
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(`Resend rejected the email: ${(err as { message?: string }).message ?? res.status}`);
  }

  const data = (await res.json()) as { id: string };
  return {
    driver: "resend",
    messageId: data.id,
    sentAt: new Date(),
  };
}

// ─── Transport: Console (dev fallback) ───────────────────────────────────────

function consoleDriver(args: ReportEmailArgs): ReportEmailResult {
  const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  // ── Diagnostic: this fires when neither SMTP nor Resend is configured ───
  console.info(
    "[send-report:console] ⚠️  EMAIL NOT SENT — no transport configured.\n" +
    "  To enable SMTP set: SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local\n" +
    "  To enable Resend set: EMAIL_PROVIDER=resend, RESEND_API_KEY in .env.local",
    {
      messageId,
      to: args.to,
      subject: args.subject,
      attachment: `${args.attachment.filename} (${args.attachment.content.byteLength} bytes)`,
      smtpHostSet: Boolean(process.env.SMTP_HOST),
      smtpUserSet: Boolean(process.env.SMTP_USER),
      smtpPassSet: Boolean(process.env.SMTP_PASS),
      resendConfigured: isResendConfigured(),
    },
  );
  return { driver: "console", messageId, sentAt: new Date() };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a salesperson performance report email with a PDF attachment.
 * Selects the best available transport automatically.
 */
export async function sendReportEmail(
  args: ReportEmailArgs,
): Promise<ReportEmailResult> {
  // ── Driver selection diagnostic ──────────────────────────────────────────
  const selectedDriver = isSmtpConfigured() ? "smtp"
    : isResendConfigured() ? "resend"
    : "console";

  console.info("[send-report] Driver selected:", selectedDriver, {
    smtpConfigured:   isSmtpConfigured(),
    resendConfigured: isResendConfigured(),
    to:               args.to,
  });

  if (selectedDriver === "smtp")    return smtpDriver(args);
  if (selectedDriver === "resend")  return resendDriver(args);
  return consoleDriver(args);
}
