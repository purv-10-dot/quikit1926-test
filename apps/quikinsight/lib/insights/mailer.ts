import nodemailer from "nodemailer";

// Insights reports are sent from a dedicated mailbox. We prefer the SMTP_* vars
// (e.g. the QuikSupport mailbox) and fall back to the app-wide EMAIL_SERVER_* /
// EMAIL_FROM credentials used by magic-link and invitation emails.

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

const HOST = process.env.SMTP_HOST;
const PORT = Number(process.env.SMTP_PORT || 587);
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;

// SMTP_FROM may be a full "Name <addr>" string or a bare address.
const FROM = process.env.SMTP_FROM ?? USER;

function getTransport() {
  if (!HOST) throw new Error("Email service not configured — set SMTP_HOST in .env.local");
  return nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465, // 465 → implicit TLS, 587 → STARTTLS
    requireTLS: PORT === 587,
    auth: { user: USER, pass: PASS },
  });
}

export async function sendReportEmail(params: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
}): Promise<SendResult> {
  if (!FROM) return { ok: false, error: "Sender not configured (SMTP_FROM / EMAIL_FROM)" };
  if (params.to.length === 0) return { ok: false, error: "No recipients" };

  try {
    const info = await getTransport().sendMail({
      from: FROM,
      to: params.to.join(", "),
      ...(params.cc?.length   ? { cc:  params.cc.join(", ")  } : {}),
      ...(params.bcc?.length  ? { bcc: params.bcc.join(", ") } : {}),
      subject: params.subject,
      html: params.html,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
