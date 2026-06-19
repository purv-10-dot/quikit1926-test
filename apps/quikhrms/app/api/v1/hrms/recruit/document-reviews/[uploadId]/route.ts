import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { queueEmail } from "@/lib/services/mailer";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(1000).optional(),
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed");

    const upload = await prisma.candidateDocumentUpload.findFirst({
      where: { id: params.uploadId, orgId, deletedAt: null },
      include: {
        request: {
          include: {
            application: {
              include: {
                candidate: { select: { firstName: true, lastName: true, email: true } },
                requisition: { select: { title: true } },
              },
            },
          },
        },
        documentType: { select: { name: true } },
      },
    });
    if (!upload) return notFound("Upload not found");

    const updated = await prisma.candidateDocumentUpload.update({
      where: { id: upload.id },
      data: {
        status: parsed.data.action === "approve" ? "Approved" : "Rejected",
        rejectionReason: parsed.data.action === "reject" ? (parsed.data.reason ?? null) : null,
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
    });

    // If all required docs of the bundle are Approved → mark request Completed
    if (parsed.data.action === "approve") {
      const requiredTypes = await prisma.candidateDocumentType.findMany({
        where: { orgId, bundle: upload.request.bundle, isRequired: true, isActive: true, deletedAt: null },
        select: { id: true },
      });
      const approved = await prisma.candidateDocumentUpload.findMany({
        where: { requestId: upload.requestId, orgId, status: "Approved", deletedAt: null },
        select: { documentTypeId: true },
      });
      const approvedTypeIds = new Set(approved.map((a) => a.documentTypeId).filter(Boolean) as string[]);
      const allDone = requiredTypes.every((t) => approvedTypeIds.has(t.id));
      if (allDone) {
        await prisma.candidateDocumentRequest.update({
          where: { id: upload.requestId },
          data: { status: "Completed", completedAt: new Date(), updatedBy: userId },
        });
      }
    }

    // Notify candidate
    void (async () => {
      try {
        const cand = upload.request.application.candidate;
        if (!cand?.email) return;
        const company = await prisma.companySettings.findUnique({
          where: { orgId }, select: { companyName: true },
        });
        const docName = upload.documentType?.name ?? upload.customLabel ?? "Document";
        const companyName = company?.companyName ?? "Our Company";
        const approved = parsed.data.action === "approve";
        const subject = approved
          ? `Document approved: ${docName}`
          : `Action needed: ${docName} rejected`;
        const color = approved ? "#059669" : "#dc2626";
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:560px;padding:20px;">
            <h2 style="color:${color};margin:0 0 10px;">${approved ? "Document Approved" : "Document Rejected"}</h2>
            <p>Hi ${cand.firstName} ${cand.lastName},</p>
            <p>Your document <strong>${docName}</strong> for the <strong>${upload.request.application.requisition.title}</strong> application has been <strong>${approved ? "approved" : "rejected"}</strong>.</p>
            ${!approved && parsed.data.reason ? `<p><strong>Reason:</strong> ${parsed.data.reason}</p><p>Please re-upload a corrected version using the same link we sent earlier.</p>` : ""}
            <p style="margin-top:24px;color:#6b7280;font-size:12px;">${companyName} HRMS</p>
          </div>`;
        await queueEmail(orgId, { to: cand.email, subject, html, kind: "candidate-doc.review" });
      } catch (e) { console.error("review mail failed", e); }
    })();

    return successResponse(updated);
  } catch (e) {
    console.error("POST doc review", e);
    return internalError();
  }
});
