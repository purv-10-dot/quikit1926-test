import { prisma } from "@/lib/prisma";
import type { DocumentBundle } from "@quikit/database";
import { generateCandidateDocToken, CANDIDATE_DOC_EXPIRY_DAYS } from "@/lib/services/candidate-doc-token";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildCandidateDocRequestEmail } from "@/lib/email-templates/candidate-document-request";
import { ensureCandidateDocDefaults } from "@/lib/services/candidate-doc-setup";
import { whereEmployeeHasAnyRole, sortByMaxRolePriorityDesc, appRolesNameSelect } from "@/lib/rbac/queries";

export interface TriggerResult {
  requestId: string;
  reused: boolean;
  mailed: boolean;
  mailError?: string;
}

export async function triggerCandidateDocBundle(
  orgId: string,
  applicationId: string,
  bundle: DocumentBundle,
  actorUserId?: string | null,
  documentTypeIds?: string[] | null,
  submissionDeadline?: Date | string | null,
): Promise<TriggerResult> {
  await ensureCandidateDocDefaults(orgId, actorUserId ?? undefined);

  // undefined → caller didn't send a deadline (leave as-is); null/empty → clear;
  // value → set. Kept separate so we can spread it conditionally into writes.
  const deadlineVal: Date | null | undefined =
    submissionDeadline === undefined ? undefined : (submissionDeadline ? new Date(submissionDeadline) : null);
  const deadlineData = deadlineVal !== undefined ? { submissionDeadline: deadlineVal } : {};

  const app = await prisma.jobApplication.findFirst({
    where: { id: applicationId, orgId, deletedAt: null },
    include: {
      candidate: { select: { firstName: true, lastName: true, email: true } },
      requisition: { select: { title: true } },
    },
  });
  if (!app) throw new Error("Application not found");
  if (!app.candidate?.email) throw new Error("Candidate email missing");

  // Reuse existing pending request or create new
  let request = await prisma.candidateDocumentRequest.findFirst({
    where: { orgId, applicationId, bundle, deletedAt: null },
  });
  let reused = false;

  if (request && request.status === "Completed") {
    reused = true;
  }

  // Existing PENDING request → this call is an "update / re-request": refresh the
  // selected doc list and deadline before we regenerate the link + re-send mail.
  if (request && request.status === "Pending") {
    request = await prisma.candidateDocumentRequest.update({
      where: { id: request.id },
      data: {
        ...(documentTypeIds && documentTypeIds.length
          ? { selectedDocTypeIds: documentTypeIds as unknown as object }
          : {}),
        ...deadlineData,
        updatedBy: actorUserId ?? null,
      },
    });
  }

  if (!request || request.status !== "Pending") {
    if (request) {
      // Regenerate token on a resend for Pending-only; for Completed don't recreate
      if (request.status === "Completed") {
        return { requestId: request.id, reused: true, mailed: false };
      }
    }
    const placeholder = `tmp_${Date.now()}`;
    const selectedPayload = documentTypeIds && documentTypeIds.length ? documentTypeIds : null;
    const created = request
      ? await prisma.candidateDocumentRequest.update({
          where: { id: request.id },
          data: {
            status: "Pending", requestSentAt: new Date(), reminderCount: 0, lastReminderAt: null,
            updatedBy: actorUserId ?? null,
            token: placeholder,
            tokenExpiresAt: new Date(Date.now() + CANDIDATE_DOC_EXPIRY_DAYS * 86400000),
            selectedDocTypeIds: selectedPayload ? (selectedPayload as unknown as object) : undefined,
            ...deadlineData,
          },
        })
      : await prisma.candidateDocumentRequest.create({
          data: {
            orgId, applicationId, bundle,
            status: "Pending",
            token: placeholder,
            tokenExpiresAt: new Date(Date.now() + CANDIDATE_DOC_EXPIRY_DAYS * 86400000),
            selectedDocTypeIds: selectedPayload ? (selectedPayload as unknown as object) : undefined,
            ...deadlineData,
            createdBy: actorUserId ?? null,
            updatedBy: actorUserId ?? null,
          },
        });
    request = created;
  }

  // Bind real token keyed to the record id
  const { token, expiresAt } = generateCandidateDocToken({
    requestId: request.id, orgId, applicationId, bundle,
  });
  await prisma.candidateDocumentRequest.update({
    where: { id: request.id },
    data: { token, tokenExpiresAt: expiresAt },
  });

  // Resolve doc list + company for mail
  const selectedIds = Array.isArray(request.selectedDocTypeIds) ? (request.selectedDocTypeIds as unknown as string[]) : null;
  const docs = await prisma.candidateDocumentType.findMany({
    where: {
      orgId, bundle, isActive: true, deletedAt: null,
      ...(selectedIds && selectedIds.length ? { id: { in: selectedIds } } : {}),
    },
    orderBy: { sortOrder: "asc" },
    select: { name: true, isRequired: true, helpText: true },
  });
  const company = await prisma.companySettings.findUnique({
    where: { orgId }, select: { companyName: true, addressLine1: true, addressLine2: true, city: true, state: true, phone: true },
  });
  const addressBits = [company?.addressLine1, company?.addressLine2, company?.city, company?.state].filter(Boolean).join(", ");

  // Optional HR sender (for post-offer reporting-contact block).
  // Priority gone from AppRole — fetch candidates + JS-sort by ROLE_PRIORITY.
  const hrCandidates = await prisma.employee.findMany({
    where: {
      orgId, deletedAt: null, status: "Active",
      ...whereEmployeeHasAnyRole(["admin"]),
    },
    select: { firstName: true, lastName: true, workEmail: true, workPhone: true, ...appRolesNameSelect },
  });
  const hr = sortByMaxRolePriorityDesc(hrCandidates)[0] ?? null;

  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
  const portalUrl = `${base}/candidate-documents/${token}`;

  const docData = {
    candidateName: `${app.candidate.firstName} ${app.candidate.lastName}`.trim(),
    jobTitle: app.requisition.title,
    bundle,
    portalUrl,
    expiryDays: CANDIDATE_DOC_EXPIRY_DAYS,
    docs: docs.map((d) => ({ name: d.name, isRequired: d.isRequired, helpText: d.helpText })),
    companyName: company?.companyName ?? "Our Company",
    submissionDeadline: request.submissionDeadline
      ? new Date(request.submissionDeadline).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
      : null,
    senderName: hr ? `${hr.firstName} ${hr.lastName}`.trim() : "HR Department",
    senderPhone: hr?.workPhone ?? null,
    startDate: app.offerJoiningDate ? new Date(app.offerJoiningDate).toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : null,
    location: addressBits || null,
    acceptanceDeadline: app.offerExpiresAt ? new Date(app.offerExpiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : null,
  };
  const docsListHtml = `<ul>${docData.docs
    .map((d) => `<li>${d.name}${d.isRequired ? "" : " (optional)"}</li>`)
    .join("")}</ul>`;

  // mailed = queued onto the email queue; the worker handles delivery + retries.
  try {
    await resolveAndSend(orgId, {
      key: "candidate-doc.request",
      to: app.candidate.email,
      vars: {
        candidateName: docData.candidateName,
        jobTitle: docData.jobTitle,
        bundle: docData.bundle,
        portalUrl: docData.portalUrl,
        expiryDays: docData.expiryDays,
        senderName: docData.senderName,
        senderPhone: docData.senderPhone ?? "",
        startDate: docData.startDate ?? "",
        location: docData.location ?? "",
        submissionDeadline: docData.submissionDeadline ?? "",
        docsListHtml,
        companyName: docData.companyName,
      },
      fallback: () => buildCandidateDocRequestEmail(docData),
    });
    return { requestId: request.id, reused, mailed: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "enqueue failed";
    return { requestId: request.id, reused, mailed: false, mailError: msg };
  }
}

export interface ReminderResult {
  requestId: string;
  reminderCount: number;
  mailed: boolean;
  mailError?: string;
  pendingDocs: string[];
}

export async function sendCandidateDocReminder(
  orgId: string,
  applicationId: string,
  bundle: DocumentBundle,
  actorUserId?: string | null,
): Promise<ReminderResult> {
  const app = await prisma.jobApplication.findFirst({
    where: { id: applicationId, orgId, deletedAt: null },
    include: {
      candidate: { select: { firstName: true, lastName: true, email: true } },
      requisition: { select: { title: true } },
    },
  });
  if (!app) throw new Error("Application not found");
  if (!app.candidate?.email) throw new Error("Candidate email missing");

  const request = await prisma.candidateDocumentRequest.findFirst({
    where: { orgId, applicationId, bundle, deletedAt: null },
    include: {
      uploads: {
        where: { deletedAt: null },
        include: { documentType: { select: { id: true, name: true, code: true, isRequired: true } } },
      },
    },
  });
  if (!request) throw new Error("No document request exists. Send the initial request first.");
  if (request.status === "Completed") throw new Error("Documents already completed — no reminder needed.");

  // Resolve the doc list (selected or all required)
  const selectedIds = Array.isArray(request.selectedDocTypeIds) ? (request.selectedDocTypeIds as unknown as string[]) : null;
  const docTypes = await prisma.candidateDocumentType.findMany({
    where: {
      orgId, bundle, isActive: true, deletedAt: null,
      ...(selectedIds && selectedIds.length ? { id: { in: selectedIds } } : {}),
    },
    orderBy: { sortOrder: "asc" },
  });

  const approvedTypeIds = new Set(
    request.uploads.filter((u) => u.status === "Approved" && u.documentType?.id).map((u) => u.documentType!.id),
  );
  const pendingDocs = docTypes.filter((d) => !approvedTypeIds.has(d.id));

  // Refresh token if expired or missing
  let token = request.token;
  let tokenExpiresAt = request.tokenExpiresAt;
  if (!tokenExpiresAt || tokenExpiresAt.getTime() < Date.now()) {
    const fresh = generateCandidateDocToken({ requestId: request.id, orgId, applicationId, bundle });
    token = fresh.token;
    tokenExpiresAt = fresh.expiresAt;
  }

  await prisma.candidateDocumentRequest.update({
    where: { id: request.id },
    data: {
      reminderCount: { increment: 1 },
      lastReminderAt: new Date(),
      token, tokenExpiresAt,
      updatedBy: actorUserId ?? null,
    },
  });

  const company = await prisma.companySettings.findUnique({
    where: { orgId }, select: { companyName: true, addressLine1: true, addressLine2: true, city: true, state: true, phone: true },
  });
  const addressBits = [company?.addressLine1, company?.addressLine2, company?.city, company?.state].filter(Boolean).join(", ");

  const hrCandidates2 = await prisma.employee.findMany({
    where: {
      orgId, deletedAt: null, status: "Active",
      ...whereEmployeeHasAnyRole(["admin"]),
    },
    select: { firstName: true, lastName: true, workEmail: true, workPhone: true, ...appRolesNameSelect },
  });
  const hr = sortByMaxRolePriorityDesc(hrCandidates2)[0] ?? null;

  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
  const portalUrl = `${base}/candidate-documents/${token}`;

  const reminderLevel = ((request.reminderCount ?? 0) >= 2 ? 3 : (request.reminderCount ?? 0) === 1 ? 2 : 1) as 1 | 2 | 3;
  const docData = {
    candidateName: `${app.candidate.firstName} ${app.candidate.lastName}`.trim(),
    jobTitle: app.requisition.title,
    bundle,
    portalUrl,
    expiryDays: CANDIDATE_DOC_EXPIRY_DAYS,
    docs: pendingDocs.map((d) => ({ name: d.name, isRequired: d.isRequired, helpText: d.helpText })),
    companyName: company?.companyName ?? "Our Company",
    submissionDeadline: request.submissionDeadline
      ? new Date(request.submissionDeadline).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
      : null,
    senderName: hr ? `${hr.firstName} ${hr.lastName}`.trim() : "HR Department",
    senderPhone: hr?.workPhone ?? null,
    startDate: app.offerJoiningDate ? new Date(app.offerJoiningDate).toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) : null,
    location: addressBits || null,
    acceptanceDeadline: app.offerExpiresAt ? new Date(app.offerExpiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : null,
    isReminder: true,
    reminderLevel,
  };
  const docsListHtml = `<ul>${docData.docs
    .map((d) => `<li>${d.name}${d.isRequired ? "" : " (optional)"}</li>`)
    .join("")}</ul>`;

  let mailed = true;
  let mailError: string | undefined;
  try {
    await resolveAndSend(orgId, {
      key: "candidate-doc.reminder",
      to: app.candidate.email,
      vars: {
        candidateName: docData.candidateName,
        jobTitle: docData.jobTitle,
        bundle: docData.bundle,
        portalUrl: docData.portalUrl,
        expiryDays: docData.expiryDays,
        reminderLevel,
        submissionDeadline: docData.submissionDeadline ?? "",
        docsListHtml,
        companyName: docData.companyName,
      },
      fallback: () => buildCandidateDocRequestEmail(docData),
    });
  } catch (err) {
    mailed = false;
    mailError = err instanceof Error ? err.message : "enqueue failed";
  }

  return {
    requestId: request.id,
    reminderCount: (request.reminderCount ?? 0) + 1,
    mailed,
    mailError,
    pendingDocs: pendingDocs.map((d) => d.name),
  };
}
