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
import { appBaseUrl } from "@/lib/utils/app-url";

const bodySchema = z.object({
  applicationId: z.string().min(1).optional(),
  offerId: z.string().min(1).optional(),
  // When true, return the generated PDF for on-screen review WITHOUT emailing
  // the candidate or changing the offer status.
  preview: z.boolean().optional(),
  // Extra recipients CC'd on the offer email (HR-typed list, e.g. hiring
  // manager / reporting manager) — never used in preview mode.
  cc: z.array(z.string().email()).optional(),
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

    // Supporting docs uploaded in the Send Offer wizard. Computed now so they
    // can be downloaded IN PARALLEL with PDF generation (previously the docs
    // were fetched one-by-one after the PDF was built). Multi-doc with a legacy
    // single-doc fallback. Skipped entirely in preview mode.
    type Attachment = { filename: string; content: Buffer; contentType: string };
    const meta = (app.offeredComponents ?? null) as OfferMeta | null;
    const supportingDocs = meta?.supportingDocs?.length
      ? meta.supportingDocs
      : meta?.supportingDoc?.key
        ? [meta.supportingDoc]
        : [];
    // CC list — a fresh Send provides it explicitly; a bare Resend (no wizard,
    // just the "Resend" button) sends no `cc` at all, so fall back to whatever
    // was saved from the original send.
    const effectiveCc = parsed.data.cc ?? meta?.cc;

    // Generate the offer PDF and download supporting docs concurrently.
    const [pdfBuffer, fetchedDocs] = await Promise.all([
      generateOfferPdf({
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
      }),
      parsed.data.preview
        ? Promise.resolve([] as Attachment[])
        : Promise.all(
            supportingDocs
              .filter((d) => d?.key)
              .map(async (doc): Promise<Attachment | null> => {
                try {
                  const obj = await getObject(doc.key!);
                  return {
                    filename: doc.name || doc.key!.split("/").pop() || "attachment",
                    content: Buffer.from(obj.body),
                    contentType: obj.contentType,
                  };
                } catch (e) {
                  // Best-effort — one bad attachment must not block the offer email.
                  console.error("[mail/offer] supporting doc attach failed:", doc.key, e);
                  return null;
                }
              }),
          ).then((rows) => rows.filter((r): r is Attachment => r !== null)),
    ]);

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
    const appBase = appBaseUrl();
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

    const attachments: Attachment[] = [
      { filename: pdfName, content: pdfBuffer, contentType: "application/pdf" },
      ...fetchedDocs,
    ];

    // Mark as sent up front, then hand the SMTP send off to the background —
    // a slow/hanging Office365 connection must never hold up this response
    // (that's what was tripping the "Request Timeout" on UAT). The PDF +
    // attachments are already built above, so all that's left is the network
    // send; failures are still logged server-side even though nothing here
    // awaits them.
    await prisma.jobApplication.update({
      where: { id: app.id },
      data: {
        offerStatus: "OfferSent", offerSentAt: new Date(), updatedBy: userId,
        // Only overwrite the saved CC list on an explicit Send (cc provided) —
        // a bare Resend passes no `cc` at all and must not wipe it out.
        ...(parsed.data.cc !== undefined
          ? { offeredComponents: JSON.parse(JSON.stringify({ ...(meta ?? {}), cc: parsed.data.cc })) }
          : {}),
      },
    });

    void resolveAndSend(orgId, {
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
      cc: effectiveCc,
    }).then((result) => {
      if (!result.sent) console.error(`[mail/offer] send failed for application ${app.id}:`, result.error);
    }).catch((e) => console.error(`[mail/offer] send threw for application ${app.id}:`, e));

    return successResponse({ sent: true, offerId: app.id, to: candidate.email });
  } catch (error) {
    console.error("POST /mail/offer error:", error);
    return internalError();
  }
});
