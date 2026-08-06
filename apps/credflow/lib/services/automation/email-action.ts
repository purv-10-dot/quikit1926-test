/**
 * [P3.B2] send_email action — merge-field substitution + send suppression.
 * SPEC §5.1, §8 · SURVEY #7.
 *
 * Layers on top of B1's dispatcher (email-dispatch.ts):
 *   - Merge fields: the §8 MINIMAL grammar only — a single named lead field
 *     `{fieldName}` substituted into subject/body. NOT the full `@{Entity:Field}`
 *     grammar and NO arithmetic (both DEFERRED). An unknown/null/non-scalar field
 *     renders as empty string.
 *   - Suppression (checked BEFORE any dispatch): a lead with no valid email, or
 *     flagged Do-Not-Email, or unsubscribed, is SKIPPED. A skip is recorded as a
 *     CrmOutboundMessageLog row with status "skipped" + the reason — it is not an
 *     error and does not crash the run.
 *
 * SAFETY (Constraint 1.1): this module decides recipient/skip and then hands a
 * queued row to the B1 dispatcher; it never selects a mail driver. The captured
 * console transport is enforced by env/tests, never a real lead address.
 */
import type { CrmLead as Lead } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { dispatchOutboundMessage } from "@/lib/services/automation/email-dispatch";

/** Same shape RFC-5322-lite check the mail infra uses in `ensureRecipients`. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export interface SuppressionResult {
  suppressed: boolean;
  /** "do-not-email" | "unsubscribed" | "no-valid-email" when suppressed. */
  reason?: string;
}

export interface SendEmailConfig {
  /** Literal recipient override; when absent the lead's own email is used. */
  to?: string;
  subject?: string;
  body?: string;
}

export interface SendEmailActionResult {
  status: "sent" | "failed" | "skipped";
  logId: string;
  reason?: string;
}

/**
 * Minimal merge-field substitution (SPEC §8). Replaces `{fieldName}` tokens with
 * the lead's own scalar field value. Missing / null / non-scalar (objects, JSON,
 * Date) → empty string. Single-field only; no arithmetic, no cross-entity refs.
 */
export function renderMergeFields(template: string, lead: Lead): string {
  return template.replace(/\{(\w+)\}/g, (_match, field: string) => {
    const v = (lead as unknown as Record<string, unknown>)[field];
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      return String(v);
    }
    return ""; // Date / JSON / relation — not a merge target in the minimal grammar.
  });
}

/**
 * Suppression check (SPEC §5.1), run before any dispatch. Order: explicit
 * Do-Not-Email, then unsubscribed, then address validity. Maps to CredFlow's own
 * lead flags (`doNotEmail` / `unsubscribed`, additive nullable — NULL = mailable).
 */
export function evaluateSuppression(lead: Lead, recipient: string): SuppressionResult {
  if (lead.doNotEmail === true) return { suppressed: true, reason: "do-not-email" };
  if (lead.unsubscribed === true) return { suppressed: true, reason: "unsubscribed" };
  if (!recipient || !EMAIL_RE.test(recipient)) return { suppressed: true, reason: "no-valid-email" };
  return { suppressed: false };
}

/**
 * Execute the send_email node: resolve recipient, render merge fields, apply
 * suppression, then either record a skipped row (no dispatch) or queue + dispatch
 * via B1. Tenant-scoped (Constraint 1.4). Never throws for a suppressed/failed
 * send — the run continues.
 */
export async function executeSendEmail(input: {
  tenantId: string;
  lead: Lead;
  cfg: SendEmailConfig;
}): Promise<SendEmailActionResult> {
  const { tenantId, lead, cfg } = input;
  const recipient = (cfg.to?.trim() || lead.email?.trim() || "");
  const subject = renderMergeFields(String(cfg.subject ?? "Hello from QuikCRM"), lead);
  const body = renderMergeFields(String(cfg.body ?? ""), lead);

  const suppression = evaluateSuppression(lead, recipient);
  if (suppression.suppressed) {
    // Recorded, not dispatched — a suppressed send is a logged non-event, not an
    // error (SPEC §5.1). Status "skipped" keeps it out of the dispatcher's reach.
    const row = await prisma.crmOutboundMessageLog.create({
      data: {
        tenantId,
        channel: "email",
        to: recipient,
        subject,
        body,
        status: "skipped",
        metadata: { skippedReason: suppression.reason },
      },
    });
    return { status: "skipped", logId: row.id, reason: suppression.reason };
  }

  const row = await prisma.crmOutboundMessageLog.create({
    data: { tenantId, channel: "email", to: recipient, subject, body, status: "queued" },
  });
  const res = await dispatchOutboundMessage(tenantId, row.id);
  const status: SendEmailActionResult["status"] =
    res.outcome === "sent" ? "sent" : res.outcome === "failed" ? "failed" : "skipped";
  return { status, logId: row.id, reason: res.reason };
}
