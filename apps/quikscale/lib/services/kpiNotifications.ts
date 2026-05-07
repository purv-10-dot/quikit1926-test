import { db } from "@/lib/db";
import { sendEmail, buildKPIAssignmentEmail } from "./email";

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

  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "";
  const kpiUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/kpi?highlight=${kpiId}` : undefined;

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
