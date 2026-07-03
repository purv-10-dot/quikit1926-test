import { Resend } from "resend";

/**
 * Email sending via Resend. When RESEND_API_KEY + EMAIL_FROM are configured the
 * message is actually delivered; otherwise it returns a "queued" result so the
 * caller still logs the email (honest degradation, like the e-Invoice flow).
 */

export type SendResult =
  | { status: "sent"; providerId: string | null }
  | { status: "queued"; message: string }
  | { status: "failed"; error: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(params: { to: string; subject: string; html: string; cc?: string | null }): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { status: "queued", message: "Email provider not configured (set RESEND_API_KEY and EMAIL_FROM). The email was logged." };
  }
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.cc ? { cc: params.cc.split(",").map((c) => c.trim()).filter(Boolean) } : {})
    });
    if (error) return { status: "failed", error: error.message ?? "Send failed." };
    return { status: "sent", providerId: data?.id ?? null };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "Send failed." };
  }
}

/** Wrap plain text / partial HTML in a minimal branded email shell. */
export function emailHtml(body: string, orgName?: string): string {
  const safe = body.includes("<") ? body : `<p>${body.replace(/\n/g, "<br/>")}</p>`;
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#172033;line-height:1.6">${safe}${orgName ? `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/><p style="color:#64748b;font-size:12px">${orgName}</p>` : ""}</div>`;
}
