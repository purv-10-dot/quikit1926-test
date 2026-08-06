import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildOnHoldEmail } from "@/lib/email-templates/application-on-hold";

// In-progress applications that should be paused + archived when a requisition
// goes on hold or is cancelled. Already-terminal ones (Hired / Rejected /
// Withdrawn / Declined) are left untouched.
// Candidates in-progress enough to pause, but NOT those already at/through an
// offer — telling someone mid-offer "your application is on hold" is wrong, so
// AppOffered is intentionally excluded from the hold/cancel cascade.
const ACTIVE_STATUSES = ["AppActive", "AppOnHold"] as const;

/**
 * When a requisition is put ON HOLD or CANCELLED, cascade to every active
 * candidate on it:
 *   1. Park the application (status → AppOnHold).
 *   2. Archive the candidate (they drop off the pipeline board; reason recorded).
 *   3. Email them an "application on hold" notice.
 *
 * Best-effort: emails never block the caller. Intended to be fired-and-forgotten
 * from the requisition PATCH route.
 */
export async function holdApplicationsForRequisition(
  orgId: string,
  requisitionId: string,
  userId: string,
  mode: "hold" | "cancel",
): Promise<{ affected: number }> {
  const reason = mode === "cancel" ? "Requisition cancelled" : "Requisition on hold";

  const apps = await prisma.jobApplication.findMany({
    where: { orgId, requisitionId, deletedAt: null, status: { in: [...ACTIVE_STATUSES] } },
    select: {
      id: true,
      candidateId: true,
      candidate: { select: { firstName: true, lastName: true, email: true } },
      requisition: { select: { title: true } },
    },
  });
  if (apps.length === 0) return { affected: 0 };

  const company = await prisma.companySettings.findUnique({
    where: { orgId }, select: { companyName: true },
  });
  const companyName = company?.companyName ?? "QuikIT HRMS";

  // Park the applications.
  await prisma.jobApplication.updateMany({
    where: { orgId, requisitionId, deletedAt: null, status: { in: [...ACTIVE_STATUSES] } },
    data: { status: "AppOnHold", updatedBy: userId },
  });

  // Archive the candidates (skip any already archived so we don't stomp an
  // existing archive reason from a manual/individual hold).
  const candidateIds = Array.from(new Set(apps.map((a) => a.candidateId)));
  await prisma.candidate.updateMany({
    where: { orgId, id: { in: candidateIds }, isArchived: false },
    data: {
      isArchived: true,
      archiveReason: reason,
      archivedAt: new Date(),
      archivedBy: userId,
      status: "CandOnHold",
    },
  });

  // Notify each candidate (customizable in Settings → Email Templates →
  // "Application On Hold"). Best-effort per recipient.
  for (const a of apps) {
    if (!a.candidate?.email) continue;
    const vars = {
      candidateName: `${a.candidate.firstName} ${a.candidate.lastName}`.trim(),
      jobTitle: a.requisition?.title ?? "the role",
      companyName,
    };
    await resolveAndSend(orgId, {
      key: "recruit.on-hold",
      to: a.candidate.email,
      vars,
      fallback: () => buildOnHoldEmail(vars),
    }).catch((err) => console.error("[requisition-hold] mail failed:", err));
  }

  return { affected: apps.length };
}
