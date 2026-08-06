import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildCandidateDocRequestEmail } from "@/lib/email-templates/candidate-document-request";
import { appBaseUrl } from "@/lib/utils/app-url";

const HOUR = 3600_000;
const TIERS: Array<{ level: 1 | 2 | 3; minAgeMs: number; maxAgeMs: number }> = [
  { level: 1, minAgeMs: 24 * HOUR, maxAgeMs: 48 * HOUR },
  { level: 2, minAgeMs: 48 * HOUR, maxAgeMs: 72 * HOUR },
  { level: 3, minAgeMs: 72 * HOUR, maxAgeMs: 7 * 24 * HOUR },
];

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  const header = req.headers.get("x-cron-secret");
  if (header !== secret) return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const base = appBaseUrl();

  const requests = await prisma.candidateDocumentRequest.findMany({
    where: { status: "Pending", deletedAt: null },
    include: {
      application: {
        include: {
          candidate: { select: { firstName: true, lastName: true, email: true } },
          requisition: { select: { title: true } },
        },
      },
    },
    take: 500,
  });

  let sent = 0, skipped = 0, failed = 0, expired = 0;
  const errors: string[] = [];

  for (const r of requests) {
    if (r.tokenExpiresAt.getTime() < now.getTime()) {
      await prisma.candidateDocumentRequest.update({ where: { id: r.id }, data: { status: "Expired" } });
      expired++;
      continue;
    }
    const age = now.getTime() - r.requestSentAt.getTime();
    const tier = TIERS.find((t) => age >= t.minAgeMs && age < t.maxAgeMs);
    if (!tier) { skipped++; continue; }
    if (r.reminderCount >= tier.level) { skipped++; continue; }
    if (r.lastReminderAt && now.getTime() - r.lastReminderAt.getTime() < 12 * HOUR) { skipped++; continue; }
    if (!r.application.candidate?.email) { skipped++; continue; }

    try {
      const docs = await prisma.candidateDocumentType.findMany({
        where: { orgId: r.orgId, bundle: r.bundle, isActive: true, deletedAt: null },
        orderBy: { sortOrder: "asc" },
        select: { name: true, isRequired: true, helpText: true },
      });
      const company = await prisma.companySettings.findUnique({
        where: { orgId: r.orgId }, select: { companyName: true },
      });

      const docData = {
        candidateName: `${r.application.candidate.firstName} ${r.application.candidate.lastName}`.trim(),
        jobTitle: r.application.requisition.title,
        bundle: r.bundle,
        portalUrl: `${base}/candidate-documents/${r.token}`,
        expiryDays: 7,
        docs: docs.map((d) => ({ name: d.name, isRequired: d.isRequired, helpText: d.helpText })),
        companyName: company?.companyName ?? "Our Company",
        isReminder: true,
        reminderLevel: tier.level,
      };
      const docsListHtml = `<ul>${docData.docs
        .map((d) => `<li>${d.name}${d.isRequired ? "" : " (optional)"}</li>`)
        .join("")}</ul>`;

      // sent = queued; the email worker handles delivery + retries.
      await resolveAndSend(r.orgId, {
        key: "candidate-doc.reminder",
        to: r.application.candidate.email,
        vars: {
          candidateName: docData.candidateName,
          jobTitle: docData.jobTitle,
          bundle: docData.bundle,
          portalUrl: docData.portalUrl,
          expiryDays: docData.expiryDays,
          reminderLevel: tier.level,
          submissionDeadline: "",
          docsListHtml,
          companyName: docData.companyName,
        },
        fallback: () => buildCandidateDocRequestEmail(docData),
      });
      await prisma.candidateDocumentRequest.update({
        where: { id: r.id },
        data: { reminderCount: tier.level, lastReminderAt: now },
      });
      sent++;
    } catch (e) {
      failed++;
      errors.push(`${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    success: true,
    data: { scanned: requests.length, sent, skipped, failed, expired, errors: errors.slice(0, 10) },
  });
}
