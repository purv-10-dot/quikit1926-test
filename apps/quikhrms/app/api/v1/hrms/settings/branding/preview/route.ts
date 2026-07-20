import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { validationError, internalError } from "@/lib/api-response";
import { generateOfferPdf } from "@/lib/services/offer-pdf";
import { DEFAULT_OFFER_LETTER_BODY } from "@/lib/recruit/offer-letter-fields";

const schema = z.object({
  // Optional live (unsaved) template body from the editor. Falls back to the
  // saved template, then the built-in default.
  body: z.string().max(20000).nullish(),
});

function today(): string {
  return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

/**
 * Renders a SAMPLE offer letter (dummy candidate data) using the org's current
 * branding + the supplied/saved body template, so admins can preview the layout
 * while editing. Returns the PDF inline.
 */
export const POST = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const company = await prisma.companySettings.findUnique({ where: { orgId } });
    const bodyTemplate =
      parsed.data.body?.trim() || company?.offerLetterBody || DEFAULT_OFFER_LETTER_BODY;

    const pdfBuffer = await generateOfferPdf({
      candidateName: "Aarav Sharma",
      candidateAddress: "12 MG Road, Indore, MP 452001",
      jobTitle: "Senior Software Engineer",
      designation: "Senior Software Engineer",
      offeredCTC: 1_800_000,
      joiningDate: "01 August 2026",
      joiningBonus: 100_000,
      relocationBonus: 50_000,
      equityGrant: "500 RSUs",
      expiresAt: "20 July 2026",
      department: "Engineering",
      reportingTo: "Priya Nair",
      companyName: company?.companyName ?? "Your Company",
      companyAddress: [company?.addressLine1, company?.addressLine2, company?.city, company?.state]
        .filter(Boolean).join(", ") || "Indore, Madhya Pradesh",
      letterDate: today(),
      letterheadKey: company?.letterheadKey ?? null,
      sealKey: company?.sealKey ?? null,
      signatureKey: company?.signatureKey ?? null,
      signatoryName: company?.signatoryName ?? "Authorised Signatory",
      signatoryDesignation: company?.signatoryDesignation ?? "Human Resources",
      footer: company?.offerLetterFooter ?? null,
      bodyTemplate,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="Offer-Letter-Sample.pdf"',
      },
    });
  } catch (error) {
    console.error("POST /settings/branding/preview error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
