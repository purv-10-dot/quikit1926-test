/**
 * [P3.B1] Email dispatch — consume a queued QcfOutboundMessageLog row and
 * actually send it through the shared mail infra (`lib/services/email/send.ts`).
 * SPEC §5.1 · SURVEY #7.
 *
 * Before Phase 3 the `send_email` node wrote a `CrmOutboundMessageLog` row with
 * status "queued" that NOTHING consumed — the mail infra (nodemailer/office365/
 * resend/brevo) sat unused. This module is that consumer: it loads a queued row
 * (tenant-scoped), dispatches it via `sendTransactionalEmail`, and transitions
 * the row queued → sent (with driver/messageId) or queued → failed (with the
 * error). A send failure is RECORDED and returned, never thrown, so a failing
 * email node does not crash the surrounding workflow run.
 *
 * SAFETY (Constraint 1.1): this function only sends through whatever driver
 * `EMAIL_PROVIDER` selects. During the build the transport MUST be the console
 * (captured) driver or a team-controlled mailbox — never a real lead address via
 * a live provider. This module does not choose the driver; the caller/env does.
 */
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { sendTransactionalEmail } from "@/lib/services/email/send";

export type DispatchOutcome = "sent" | "failed" | "skipped";

export interface DispatchResult {
  outcome: DispatchOutcome;
  driver?: string;
  messageId?: string;
  /** Populated on "failed" (the send error) or "skipped" (why it was skipped). */
  reason?: string;
}

/** Merge new keys into the row's existing JSON metadata without dropping what's
 *  already there (e.g. B2's suppression / merge-field bookkeeping). */
function mergeMetadata(
  existing: Prisma.JsonValue | null | undefined,
  add: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, ...add } as Prisma.InputJsonValue;
}

/**
 * Consume one queued outbound-message row → dispatch → update status.
 * Tenant-scoped (Constraint 1.4). Idempotent-ish: a row not in "queued" state is
 * left alone and reported as "skipped" so a re-run/retry never double-sends.
 */
export async function dispatchOutboundMessage(
  orgId: string,
  logId: string,
): Promise<DispatchResult> {
  const log = await prisma.qcfOutboundMessageLog.findFirst({
    where: { id: logId, orgId },
  });
  if (!log) return { outcome: "skipped", reason: "message log row not found for tenant" };
  if (log.status !== "queued") {
    // Already sent / failed / suppressed — never re-dispatch. This is what keeps
    // a BullMQ retry of the enclosing run from sending the same mail twice.
    return { outcome: "skipped", reason: `row not queued (status=${log.status})` };
  }
  if (log.channel !== "email") {
    return { outcome: "skipped", reason: `unsupported channel "${log.channel}"` };
  }

  try {
    const result = await sendTransactionalEmail({
      to: [log.to],
      subject: log.subject ?? "",
      text: log.body ?? "",
    });
    await prisma.qcfOutboundMessageLog.update({
      where: { id: log.id },
      data: {
        status: "sent",
        sentAt: result.sentAt,
        metadata: mergeMetadata(log.metadata, {
          driver: result.driver,
          messageId: result.messageId,
        }),
      },
    });
    return { outcome: "sent", driver: result.driver, messageId: result.messageId };
  } catch (error: unknown) {
    // A send failure is a recorded terminal state on the row, not a thrown error
    // — the workflow run continues past a failed email node (SPEC §5.1).
    const message = error instanceof Error ? error.message : String(error);
    await prisma.qcfOutboundMessageLog.update({
      where: { id: log.id },
      data: { status: "failed", metadata: mergeMetadata(log.metadata, { error: message }) },
    });
    return { outcome: "failed", reason: message };
  }
}
