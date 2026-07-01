import { db } from "@/lib/db";
import { sendEmail, buildKPIAssignmentEmail, buildKPIReplacementEmail } from "./email";
import { getAppBaseUrl } from "./appUrl";

export interface NotifyKPIAssignmentParams {
  orgId: string;
  kpiId: string;
  kpiName: string;
  quarter: string;
  year: number;
  creatorUserId: string;
  ownerUserIds: string[];
}

/**
 * Persist in-app Notification rows and dispatch assignment emails to each owner.
 * Email failures are logged but never throw — KPI creation must not roll back
 * because SMTP was unreachable.
 */
export async function notifyKPIAssignment(params: NotifyKPIAssignmentParams): Promise<void> {
  const { orgId, kpiId, kpiName, quarter, year, creatorUserId, ownerUserIds } = params;

  const recipientIds = Array.from(new Set(ownerUserIds.filter(Boolean)));
  if (recipientIds.length === 0) {
    console.log(`[notifyKPIAssignment] no recipients for kpiId=${kpiId}`);
    return;
  }
  console.log(`[notifyKPIAssignment] kpiId=${kpiId} recipients=${recipientIds.join(",")}`);

  const [creator, recipients] = await Promise.all([
    db.user.findUnique({
      where: { id: creatorUserId },
      select: { firstName: true, lastName: true, email: true },
    }),
    db.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  const creatorName = creator
    ? `${creator.firstName ?? ""} ${creator.lastName ?? ""}`.trim() || (creator.email ?? "A teammate")
    : "A teammate";

  const baseUrl = getAppBaseUrl();
  const kpiUrl = baseUrl ? `${baseUrl}/kpi?highlight=${kpiId}` : undefined;

  const title = "You have been assigned a KPI";
  const message = `${creatorName} assigned you "${kpiName}" for ${quarter} ${year}.`;

  await db.notification.createMany({
    data: recipients.map((r) => ({
      orgId,
      userId: r.id,
      title,
      message,
      type: "kpi_assigned",
      relatedEntityId: kpiId,
      relatedEntityType: "KPI",
      channel: "in_app",
    })),
  });

  await Promise.all(
    recipients.map(async (r) => {
      if (!r.email) {
        console.warn(`[notifyKPIAssignment] user ${r.id} has no email — skipping send`);
        return;
      }
      const ownerName = `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.email;
      const { subject, html, text } = buildKPIAssignmentEmail({
        ownerName,
        kpiName,
        quarter,
        year,
        creatorName,
        kpiUrl,
      });

      const result = await sendEmail({ to: r.email, subject, html, text });

      try {
        await db.notification.create({
          data: {
            orgId,
            userId: r.id,
            title,
            message: result.ok
              ? `Email sent to ${r.email}.`
              : `Email send failed: ${result.error ?? "unknown"}.`,
            type: result.ok ? "kpi_assigned_email_sent" : "kpi_assigned_email_failed",
            relatedEntityId: kpiId,
            relatedEntityType: "KPI",
            channel: "email",
          },
        });
      } catch (err) {
        console.error("[notifyKPIAssignment] failed to log email outcome", err);
      }
    }),
  );
}

export interface NotifyKPIReplacementParams {
  orgId: string;
  kpiId: string;
  oldName: string;
  newName: string;
  quarter: string;
  year: number;
  /** Who performed the replacement (the OPSP export actor). */
  replacedByUserId: string;
  ownerUserId: string;
  /** Whether the owner's previous weekly data was carried forward. */
  dataRetained: boolean;
}

/**
 * In-app + email notification to a KPI's owner that their KPI was replaced via
 * the OPSP "Export → Replace" flow. Email failures are logged but never thrown
 * — the replacement mutation already committed and must not roll back.
 */
export async function notifyKPIReplacement(params: NotifyKPIReplacementParams): Promise<void> {
  const { orgId, kpiId, oldName, newName, quarter, year, replacedByUserId, ownerUserId, dataRetained } = params;
  if (!ownerUserId) return;

  const [actor, owner] = await Promise.all([
    db.user.findUnique({
      where: { id: replacedByUserId },
      select: { firstName: true, lastName: true, email: true },
    }),
    db.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);
  if (!owner) {
    console.warn(`[notifyKPIReplacement] owner ${ownerUserId} not found`);
    return;
  }

  const replacedByName = actor
    ? `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim() || (actor.email ?? "A teammate")
    : "A teammate";

  const baseUrl = getAppBaseUrl();
  const kpiUrl = baseUrl ? `${baseUrl}/kpi?highlight=${kpiId}` : undefined;

  const title = "Your KPI was replaced";
  const message = `${replacedByName} replaced "${oldName}" with "${newName}" for ${quarter} ${year}.`;

  await db.notification.create({
    data: {
      orgId,
      userId: owner.id,
      title,
      message,
      type: "kpi_replaced",
      relatedEntityId: kpiId,
      relatedEntityType: "KPI",
      channel: "in_app",
    },
  });

  if (!owner.email) {
    console.warn(`[notifyKPIReplacement] user ${owner.id} has no email — skipping send`);
    return;
  }

  const ownerName = `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim() || owner.email;
  const { subject, html, text } = buildKPIReplacementEmail({
    ownerName,
    oldName,
    newName,
    quarter,
    year,
    replacedByName,
    dataRetained,
    url: kpiUrl,
  });

  const result = await sendEmail({ to: owner.email, subject, html, text });

  try {
    await db.notification.create({
      data: {
        orgId,
        userId: owner.id,
        title,
        message: result.ok
          ? `Email sent to ${owner.email}.`
          : `Email send failed: ${result.error ?? "unknown"}.`,
        type: result.ok ? "kpi_replaced_email_sent" : "kpi_replaced_email_failed",
        relatedEntityId: kpiId,
        relatedEntityType: "KPI",
        channel: "email",
      },
    });
  } catch (err) {
    console.error("[notifyKPIReplacement] failed to log email outcome", err);
  }
}
