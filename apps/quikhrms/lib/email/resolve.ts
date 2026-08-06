/**
 * Email send path with tenant override + code-default fallback.
 *
 * Every transactional email is sent through `resolveAndSend`. It looks up the
 * org's `EmailTemplate` override for the event `key` (Email channel):
 *   - override present & enabled → render its subject/body with `{{vars}}` and send
 *   - override present & disabled → suppress (the notification is intentionally off)
 *   - no override → call `fallback()` (the existing branded code builder) and send
 *
 * Attachments (payslip/offer PDFs, S3 docs) are NOT part of the customizable
 * body — they are always passed through regardless of override.
 */

import { prisma } from "@/lib/prisma";
import { sendMail, renderTemplate, type MailAttachment } from "@/lib/services/mailer";

type TemplateVars = Record<string, string | number | boolean | null | undefined>;

export interface ResolveAndSendInput {
  /** Registry event key, e.g. "leave.decision". */
  key: string;
  to: string | string[];
  /** Values substituted into an override's `{{placeholders}}`. */
  vars: TemplateVars;
  /** Produces the branded default subject/html when no override exists. */
  fallback: () => { subject: string; html: string };
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: MailAttachment[];
}

export interface ResolveAndSendResult {
  sent: boolean;
  suppressed?: boolean;
  error?: string;
}

/** renderTemplate coerces non-strings; keep the vars bag shallow. */
function coerce(vars: TemplateVars): Record<string, string | number | null | undefined> {
  const out: Record<string, string | number | null | undefined> = {};
  for (const [k, val] of Object.entries(vars)) out[k] = typeof val === "boolean" ? String(val) : val;
  return out;
}

export async function resolveAndSend(
  orgId: string,
  input: ResolveAndSendInput,
): Promise<ResolveAndSendResult> {
  let subject: string;
  let html: string;

  try {
    const override = await prisma.emailTemplate.findFirst({
      where: { orgId, key: input.key, channel: "Email", deletedAt: null },
      select: { subject: true, body: true, enabled: true },
    });

    if (override) {
      if (!override.enabled) return { sent: false, suppressed: true };
      const data = coerce(input.vars);
      subject = renderTemplate(override.subject, data);
      html = renderTemplate(override.body, data);
    } else {
      const built = input.fallback();
      subject = built.subject;
      html = built.html;
    }
  } catch {
    // If the override lookup fails for any reason, never lose the email —
    // fall back to the code default.
    const built = input.fallback();
    subject = built.subject;
    html = built.html;
  }

  return sendMail({
    to: input.to,
    subject,
    html,
    cc: input.cc,
    bcc: input.bcc,
    attachments: input.attachments,
  });
}
