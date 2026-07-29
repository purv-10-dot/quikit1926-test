import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildOfferEmail } from "@/lib/email-templates/offer";
import { generateOfferPdf } from "@/lib/services/offer-pdf";
import { offerSelect, offerFromApplication, type OfferMeta } from "@/lib/recruit/offer-shape";
import { getObject } from "@/lib/storage";
import { generateOfferResponseToken } from "@/lib/services/offer-response-token";

const bodySchema = z.object({
  applicationId: z.string().min(1).optional(),
  offerId: z.string().min(1).optional(),
  // When true, return the generated PDF for on-screen review WITHOUT emailing
  // the candidate or changing the offer status.
  preview: z.boolean().optional(),
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
      bodyTemplate: company?.offerLetterBody ?? null,
    });

    // Preview mode — hand back the PDF for on-screen review, no email/no status change.
    if (parsed.data.preview) {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="Offer-Preview-${candidate.firstName}.pdf"`,
        },
      });
    }

    // Candidate self-serve accept/decline link (stateless signed token).
    const { token: responseToken } = generateOfferResponseToken(app.id, orgId);
    const appBase = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
    const responseUrl = `${appBase}/offer/${responseToken}`;

    const offerData = {
      candidateName,
      jobTitle,
      designation: offer.designation ?? "",
      offeredCTC: Number(offer.offeredCTC),
      joiningDate: fmtDate(offer.joiningDate),
      joiningBonus: offer.joiningBonus ? Number(offer.joiningBonus) : null,
      expiresAt: offer.expiresAt ? fmtDate(offer.expiresAt) : null,
      companyName,
      acceptUrl: responseUrl,
    };

    const pdfName = `Offer-${candidate.firstName}-${candidate.lastName}.pdf`.replace(/\s+/g, "");

    const attachments: { filename: string; content: Buffer; contentType: string }[] = [
      { filename: pdfName, content: pdfBuffer, contentType: "application/pdf" },
    ];

    // Attach the HR-uploaded supporting documents (from the Send Offer wizard).
    // Supports multiple docs; falls back to the legacy single-doc field for
    // offers created before the multi-doc change. Best-effort per file — a
    // fetch failure on one attachment must not block the offer email.
    const meta = (app.offeredComponents ?? null) as OfferMeta | null;
    const supportingDocs = meta?.supportingDocs?.length
      ? meta.supportingDocs
      : meta?.supportingDoc?.key
        ? [meta.supportingDoc]
        : [];
    for (const doc of supportingDocs) {
      if (!doc?.key) continue;
      try {
        const obj = await getObject(doc.key);
        attachments.push({
          filename: doc.name || doc.key.split("/").pop() || "attachment",
          content: Buffer.from(obj.body),
          contentType: obj.contentType,
        });
      } catch (e) {
        console.error("[mail/offer] supporting doc attach failed:", doc.key, e);
      }
    }

    const result = await resolveAndSend(orgId, {
      key: "recruit.offer-branded",
      to: candidate.email,
      vars: {
        candidateName, jobTitle,
        designation: offerData.designation,
        offeredCTC: `₹${Number(offer.offeredCTC).toLocaleString("en-IN")}`,
        joiningDate: offerData.joiningDate,
        joiningBonus: offer.joiningBonus ? `₹${Number(offer.joiningBonus).toLocaleString("en-IN")}` : "",
        expiresAt: offerData.expiresAt ?? "",
        companyName,
        acceptUrl: responseUrl,
        responseUrl,
      },
      fallback: () => buildOfferEmail(offerData),
      attachments,
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
