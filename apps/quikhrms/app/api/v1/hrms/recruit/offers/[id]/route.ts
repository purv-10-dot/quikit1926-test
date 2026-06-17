import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateOfferSchema } from "@/lib/validations/recruit";
import { fireWorkflow } from "@/lib/workflows/executor";
import { offerSelect, offerFromApplication } from "@/lib/recruit/offer-shape";

// The offer is now part of JobApplication (1:1), so an offer's :id IS its
// application id.
export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const app = await prisma.jobApplication.findFirst({
      where: { id: params.id, orgId, deletedAt: null, offerStatus: { not: null } },
      select: {
        ...offerSelect,
        candidate: true,
        requisition: { select: { title: true, department: { select: { name: true } } } },
      },
    });
    if (!app) return notFound("Offer not found");
    return successResponse({
      ...offerFromApplication(app)!,
      application: { candidate: app.candidate, requisition: app.requisition },
    });
  } catch (error) { console.error("GET /recruit/offers/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.jobApplication.findFirst({
      where: { id: params.id, orgId, deletedAt: null, offerStatus: { not: null } },
      select: { id: true },
    });
    if (!existing) return notFound("Offer not found");
    const body = await req.json();
    const parsed = updateOfferSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const updateData: Record<string, unknown> = { updatedBy: userId };

    if (data.status) {
      updateData.offerStatus = data.status;
      if (data.status === "OfferSent") updateData.offerSentAt = new Date();
      if (data.status === "OfferAccepted" || data.status === "OfferDeclined") updateData.offerRespondedAt = new Date();
      // Offer + application live in the same row now, so the app status change
      // is folded into the same update.
      if (data.status === "OfferAccepted") updateData.status = "AppHired";
      if (data.status === "OfferDeclined") updateData.status = "AppDeclined";
    }
    if (data.declineReason) updateData.offerDeclineReason = data.declineReason;
    if (data.counterOfferCTC) updateData.offerCounterOfferCTC = data.counterOfferCTC;
    if (data.negotiationNotes) updateData.offerNegotiationNotes = data.negotiationNotes;

    const updatedApp = await prisma.jobApplication.update({
      where: { id: params.id },
      data: updateData,
      select: offerSelect,
    });
    const offer = offerFromApplication(updatedApp)!;

    if (data.status) {
      const statusEventMap: Record<string, string> = {
        OfferSent: "recruit.offer.sent",
        OfferAccepted: "recruit.offer.accepted",
        OfferDeclined: "recruit.offer.rejected",
      };
      const event = statusEventMap[data.status];
      if (event) {
        void fireWorkflow({
          orgId, event,
          payload: { offerId: offer.id, applicationId: offer.applicationId },
        });
      }
    }

    return successResponse(offer);
  } catch (error) { console.error("PATCH /recruit/offers/:id error:", error); return internalError(); }
});
