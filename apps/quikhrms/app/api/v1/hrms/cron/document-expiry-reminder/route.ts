import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildInsuranceExpiryEmail } from "@/lib/email-templates/insurance-expiry-reminder";

/**
 * POST /api/v1/hrms/cron/document-expiry-reminder
 *
 * Daily scan of Insurance-category documents. Each document carries its own
 * custom lead time in `metadata.notifyDaysBefore` (set on upload), so — unlike
 * the fixed day-offsets in lifecycle-automations — the trigger window is
 * computed per-document: notify once on (expiryDate - notifyDaysBefore).
 *
 * Notifies (in-app + email) BOTH the HR uploader (policy owner) AND every
 * employee enrolled in the policy via InsurancePolicyMember.
 *
 * Auth: x-cron-secret header must match CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const docs = await prisma.document.findMany({
    where: {
      category: "Insurance",
      status: "Active",
      deletedAt: null,
      expiryDate: { not: null },
    },
    select: { id: true, orgId: true, title: true, expiryDate: true, uploadedBy: true, metadata: true },
  });

  const companyNameCache = new Map<string, string>();
  async function getCompanyName(orgId: string): Promise<string> {
    const cached = companyNameCache.get(orgId);
    if (cached) return cached;
    const settings = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });
    const name = settings?.companyName ?? "Your organization";
    companyNameCache.set(orgId, name);
    return name;
  }

  async function notify(orgId: string, employeeId: string, title: string, message: string, entityId: string) {
    await prisma.hrmsNotification.create({
      data: { orgId, employeeId, type: "Warning", channel: "InApp", title, message, entityType: "Document", entityId },
    }).catch(() => { /* best-effort */ });
  }

  let notified = 0;
  for (const doc of docs) {
    const meta = doc.metadata as { notifyDaysBefore?: number; notifyEmployeeIds?: string[] } | null;
    const notifyDaysBefore = meta?.notifyDaysBefore;
    if (!notifyDaysBefore || !doc.expiryDate) continue;

    const targetDate = new Date(doc.expiryDate);
    targetDate.setHours(0, 0, 0, 0);
    targetDate.setDate(targetDate.getDate() - notifyDaysBefore);
    if (targetDate.getTime() !== todayStart.getTime()) continue;

    const expiryDateLabel = doc.expiryDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const message = `"${doc.title}" expires in ${notifyDaysBefore} day${notifyDaysBefore > 1 ? "s" : ""} (on ${expiryDateLabel}).`;
    const companyName = await getCompanyName(doc.orgId);

    // Recipients: the HR uploader (policy owner) + every enrolled employee +
    // anyone explicitly picked in the policy's "Notify" list.
    const [owner, members, extraNotify] = await Promise.all([
      prisma.employee.findFirst({ where: { id: doc.uploadedBy, orgId: doc.orgId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, workEmail: true } }),
      prisma.insurancePolicyMember.findMany({
        where: { orgId: doc.orgId, documentId: doc.id },
        select: { employee: { select: { id: true, firstName: true, lastName: true, workEmail: true } } },
      }),
      meta?.notifyEmployeeIds?.length
        ? prisma.employee.findMany({
            where: { id: { in: meta.notifyEmployeeIds }, orgId: doc.orgId, deletedAt: null },
            select: { id: true, firstName: true, lastName: true, workEmail: true },
          })
        : Promise.resolve([]),
    ]);

    const seen = new Set<string>();
    const recipients: Array<{ id: string; firstName: string | null; lastName: string | null; workEmail: string | null; isOwner: boolean }> = [];
    if (owner) { recipients.push({ ...owner, isOwner: true }); seen.add(owner.id); }
    for (const e of [...members.map((m) => m.employee), ...extraNotify]) {
      if (e && !seen.has(e.id)) { recipients.push({ ...e, isOwner: false }); seen.add(e.id); }
    }

    for (const r of recipients) {
      await notify(doc.orgId, r.id, "Insurance expiring soon", message, doc.id);
      if (!r.workEmail) continue;

      const name = `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "there";
      const built = buildInsuranceExpiryEmail({
        recipientName: name,
        companyName,
        policyName: doc.title,
        expiryDate: expiryDateLabel,
        daysLeft: notifyDaysBefore,
        isOwner: r.isOwner,
      });
      await resolveAndSend(doc.orgId, {
        key: "document.insurance-expiry",
        to: r.workEmail,
        vars: { recipientName: name, policyName: doc.title, expiryDate: expiryDateLabel, daysLeft: notifyDaysBefore },
        fallback: () => built,
      }).catch(() => { /* best-effort */ });
    }

    notified += recipients.length;
  }

  return NextResponse.json({ success: true, data: { notified } });
}
