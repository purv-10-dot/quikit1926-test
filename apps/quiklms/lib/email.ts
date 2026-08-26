/**
 * Email transport — SMTP (Nodemailer) primary, Resend optional fallback.
 * Mirrors the legacy backend's dual-provider setup.
 *
 * NOTE: template rendering (welcome-kit / course-completion / certificate /
 * upgrade-invoice) and the full send pipeline land in Phase 3. This is the
 * Phase 0 scaffold.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { optionalEnv } from './env';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: optionalEnv('SMTP_HOST'),
    port: Number(optionalEnv('SMTP_PORT') || 587),
    secure: Number(optionalEnv('SMTP_PORT')) === 465,
    auth:
      (optionalEnv('SMTP_USER') || optionalEnv('EMAIL_USER')) &&
      (optionalEnv('SMTP_PASS') || optionalEnv('EMAIL_PASSWORD'))
        ? {
            user: optionalEnv('SMTP_USER') || optionalEnv('EMAIL_USER'),
            pass: optionalEnv('SMTP_PASS') || optionalEnv('EMAIL_PASSWORD'),
          }
        : undefined,
    // Match apps/quikit's known-good Office365 transport (STARTTLS on 587).
    tls: { ciphers: 'SSLv3' },
  });
  return transporter;
}

/**
 * A file attached to an outgoing email. Same shape the legacy
 * `EmailService.sendEmail` accepted (`email.service.ts:429-433`), so ported
 * callers can pass their attachment arrays through unchanged.
 *
 * `content` is either the raw bytes or a base64-encoded string of the same
 * bytes — each transport below is handed whichever form it expects.
 */
export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  attachments?: EmailAttachment[];
}

/**
 * Nodemailer accepts the bytes directly, but a base64 STRING is attached as
 * literal text unless `encoding` says otherwise — so it is set whenever the
 * caller handed us a string.
 */
function toNodemailerAttachment(a: EmailAttachment) {
  return {
    filename: a.filename,
    content: a.content,
    ...(a.contentType ? { contentType: a.contentType } : {}),
    ...(typeof a.content === 'string' ? { encoding: 'base64' as const } : {}),
  };
}

/**
 * Resend's REST payload is JSON, so the file has to travel base64-encoded — a
 * Buffer would serialise as `{"type":"Buffer","data":[…]}`. Its `Attachment`
 * type carries no content-type field; the filename extension is what it uses.
 */
function toResendAttachment(a: EmailAttachment) {
  return {
    filename: a.filename,
    content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
  };
}

/**
 * Result of a send attempt.
 *
 * `null` means NOT SENT because no transport is configured — the same signal the
 * legacy `EmailService.sendEmail` returned (`email.service.ts`), and callers are
 * expected to branch on it. Returning void here made `sendUpgradeInvoice` record
 * `emailStatus: 'sent'` and tell the super admin "sent successfully" on an
 * environment with no mail credentials, permanently falsifying the audit trail
 * for an invoice the tenant never received.
 */
export type SendEmailResult = { messageId?: string } | null;

export async function sendEmail({ to, subject, html, from, attachments }: SendEmailInput): Promise<SendEmailResult> {
  const sender = from || optionalEnv('SMTP_FROM') || 'QuikLMS <no-reply@quikskill.ai>';

  // Prefer SMTP when configured; otherwise try Resend if a key exists.
  if (optionalEnv('SMTP_HOST')) {
    const info = await getTransporter().sendMail({
      from: sender,
      to,
      subject,
      html,
      ...(attachments?.length ? { attachments: attachments.map(toNodemailerAttachment) } : {}),
    });
    return { messageId: info?.messageId };
  }

  if (optionalEnv('RESEND_API_KEY')) {
    const { Resend } = await import('resend');
    const resend = new Resend(optionalEnv('RESEND_API_KEY'));
    const res = await resend.emails.send({
      from: sender,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(attachments?.length ? { attachments: attachments.map(toResendAttachment) } : {}),
    });
    return { messageId: res?.data?.id };
  }

  // eslint-disable-next-line no-console
  console.warn('[email] No SMTP_HOST or RESEND_API_KEY configured; email not sent:', subject);
  return null;
}
