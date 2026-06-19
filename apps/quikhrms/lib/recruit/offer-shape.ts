import type { Prisma } from "@quikit/database";

/**
 * Offer data was merged out of the standalone OfferDetail table onto
 * JobApplication (offer* columns). These helpers re-expose that data under the
 * historical OfferDetail shape so existing API consumers keep working:
 * an offer's `id` is now the application id (1:1), and `applicationId` matches.
 *
 * `offerStatus = null` means the application has no offer.
 */

// Prisma `select` fragment for the offer columns (+ ids/audit used in the shape).
export const offerSelect = {
  id: true,
  orgId: true,
  offerStatus: true,
  offerDesignation: true,
  offerDepartmentId: true,
  offerReportingToId: true,
  offeredCTC: true,
  offeredComponents: true,
  offerJoiningDate: true,
  offerJoiningBonus: true,
  offerRelocationBonus: true,
  offerEquityGrant: true,
  offerSentAt: true,
  offerRespondedAt: true,
  offerExpiresAt: true,
  offerDeclineReason: true,
  offerCounterOfferCTC: true,
  offerNegotiationNotes: true,
  offerLetterUrl: true,
  offerCreatedAt: true,
  offerCreatedBy: true,
  updatedBy: true,
} satisfies Prisma.JobApplicationSelect;

export type OfferFields = Prisma.JobApplicationGetPayload<{ select: typeof offerSelect }>;

/** True when the application carries an offer. */
export function hasOffer(app: Pick<OfferFields, "offerStatus">): boolean {
  return app.offerStatus != null;
}

/**
 * Build the legacy OfferDetail-shaped object from a JobApplication's offer*
 * columns. Returns null when no offer exists. The offer `id` is the
 * application id (the two were 1:1).
 */
export function offerFromApplication(app: OfferFields) {
  if (app.offerStatus == null) return null;
  return {
    id: app.id,
    applicationId: app.id,
    orgId: app.orgId,
    designation: app.offerDesignation,
    departmentId: app.offerDepartmentId,
    reportingToId: app.offerReportingToId,
    offeredCTC: app.offeredCTC,
    offeredComponents: app.offeredComponents,
    joiningDate: app.offerJoiningDate,
    joiningBonus: app.offerJoiningBonus,
    relocationBonus: app.offerRelocationBonus,
    equityGrant: app.offerEquityGrant,
    status: app.offerStatus,
    sentAt: app.offerSentAt,
    respondedAt: app.offerRespondedAt,
    expiresAt: app.offerExpiresAt,
    declineReason: app.offerDeclineReason,
    counterOfferCTC: app.offerCounterOfferCTC,
    negotiationNotes: app.offerNegotiationNotes,
    offerLetterUrl: app.offerLetterUrl,
    createdAt: app.offerCreatedAt,
    createdBy: app.offerCreatedBy,
    updatedBy: app.updatedBy,
  };
}
