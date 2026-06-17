import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { sendMail } from "@/lib/services/mailer";
import { buildOfferEmail } from "@/lib/email-templates/offer";
import { generateOfferPdf } from "@/lib/services/offer-pdf";
import { offerSelect, offerFromApplication } from "@/lib/recruit/offer-shape";

const bodySchema = z.object({
  applicationId: z.string().min(1).optional(),
  offerId: z.string().min(1).optional(),
}).refine(v => v.applicationId || v.offerId, { message: "applicationId or offerId required" });

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    // offerId and applicationId both identify the application (offer is 1:1 on it).
    const appId = parsed.data.offerId ?? parsed.data.applicationId!;
    const app = await prisma.jobApplication.findFirst({
      where: { id: appId, orgId, deletedAt: null, offerStatus: { not: null } },
      select: {
        ...offerSelect,
        candidate: { select: { firstName: true, lastName: true, email: true, location: true } },
        requisition: { select: { title: true } },
      },
    });
    if (!app) return notFound("Offer not found");
    const offer = offerFromApplication(app)!;

    const candidate = app.candidate;
    if (!candidate?.email) return validationError("Candidate email missing");

    const [company, department, manager] = await Promise.all([
      prisma.companySettings.findUnique({ where: { orgId } }),
      offer.departmentId
        ? prisma.department.findFirst({ where: { id: offer.departmentId, orgId }, select: { name: true } })
        : Promise.resolve(null),
      offer.reportingToId
        ? prisma.employee.findFirst({
            where: { id: offer.reportingToId, orgId },
            select: { firstName: true, lastName: true, jobTitle: true },
          })
        : Promise.resolve(null),
    ]);

    const companyName = company?.companyName ?? "Our Company";
    const jobTitle = app.requisition?.title ?? offer.designation ?? "";
    const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim();
    const candidateAddress = candidate.location ?? null;

    // Generate PDF using tenant branding
    const pdfBuffer = await generateOfferPdf({
      candidateName,
      candidateAddress,
      jobTitle,
      designation: offer.designation ?? "",
      offeredCTC: Number(offer.offeredCTC),
      joiningDate: fmtDate(offer.joiningDate),
      joiningBonus: offer.joiningBonus ? Number(offer.joiningBonus) : null,
      relocationBonus: offer.relocationBonus ? Number(offer.relocationBonus) : null,
      equityGrant: offer.equityGrant,
      expiresAt: offer.expiresAt ? fmtDate(offer.expiresAt) : null,
      department: department?.name ?? null,
      reportingTo: manager ? `${manager.firstName} ${manager.lastName}`.trim() : null,
      companyName,
      companyAddress: [company?.addressLine1, company?.addressLine2, company?.city, company?.state]
        .filter(Boolean).join(", ") || null,
      letterDate: fmtDate(new Date()),
      letterheadKey: company?.letterheadKey ?? null,
      sealKey: company?.sealKey ?? null,
      signatureKey: company?.signatureKey ?? null,
      signatoryName: company?.signatoryName ?? null,
      signatoryDesignation: company?.signatoryDesignation ?? null,
      footer: company?.offerLetterFooter ?? null,
    });

    const { subject, html } = buildOfferEmail({
      candidateName,
      jobTitle,
      designation: offer.designation ?? "",
      offeredCTC: Number(offer.offeredCTC),
      joiningDate: fmtDate(offer.joiningDate),
      joiningBonus: offer.joiningBonus ? Number(offer.joiningBonus) : null,
      expiresAt: offer.expiresAt ? fmtDate(offer.expiresAt) : null,
      companyName,
    });

    const pdfName = `Offer-${candidate.firstName}-${candidate.lastName}.pdf`.replace(/\s+/g, "");

    const result = await sendMail({
      to: candidate.email,
      subject,
      html,
      attachments: [{ filename: pdfName, content: pdfBuffer, contentType: "application/pdf" }],
    });

    if (!result.sent) return internalError(`Mail send failed: ${result.error}`);

    await prisma.jobApplication.update({
      where: { id: app.id },
      data: { offerStatus: "OfferSent", offerSentAt: new Date(), updatedBy: userId },
    });

    return successResponse({ sent: true, offerId: app.id, to: candidate.email });
  } catch (error) {
    console.error("POST /mail/offer error:", error);
    return internalError();
  }
});
