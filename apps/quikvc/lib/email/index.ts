/**
 * Email layer — Resend client + send wrapper.
 *
 * Templates live in `./templates/` as react-email components. The `sendEmail`
 * helper renders to HTML and POSTs to Resend. No-op (logged) when
 * RESEND_API_KEY is missing — keeps dev safe and tests fast.
 */
import { Resend } from "resend";
import { render } from "@react-email/render";
import type { ReactElement } from "react";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.RESEND_FROM ?? "QuikVC <noreply@quikvc.test>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  /** A react-email component element. */
  template: ReactElement;
  /** Optional reply-to. */
  replyTo?: string;
  /** Optional plain-text fallback. Auto-rendered if omitted. */
  text?: string;
}

export async function sendEmail({
  to,
  subject,
  template,
  replyTo,
  text,
}: SendEmailArgs) {
  const html = render(template);
  const plainText = text ?? render(template, { plainText: true });

  if (!resend) {
    // Dev / test fallback — log instead of failing.
    console.info("[email/dev] would send:", { to, subject });
    return { id: "dev-noop" };
  }

  const r = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    text: plainText,
    reply_to: replyTo,
  });
  if (r.error) {
    throw new Error(`Resend send failed: ${r.error.message}`);
  }
  return { id: r.data?.id ?? null };
}
