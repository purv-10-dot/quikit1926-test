import type { Prisma } from "@quikit/database";

// Everything the "Send Offer" wizard captures beyond the dedicated offer* columns
// is packed into JobApplication.offeredComponents (Json). This is the shape.
export interface OfferMeta {
  employmentType?: string;
  compensationType?: string;
  salaryStructureId?: string;
  salaryTemplateName?: string;
  probationPeriod?: string;
  workMode?: string;
  workLocation?: string;
  components?: { name: string; annual: number }[];
  /** @deprecated single-doc — kept so old offers still render/attach. */
  supportingDoc?: { key: string; name?: string } | null;
  supportingDocs?: { key: string; name?: string }[];
}

// Wizard input fields (from create/update offer payloads) used to build OfferMeta.
export interface OfferMetaInput {
  employmentType?: string;
  compensationType?: string;
  salaryStructureId?: string;
  salaryTemplateName?: string;
  probationPeriod?: string;
  workMode?: string;
  workLocation?: string;
  components?: { name: string; annual: number }[];
  supportingDocKey?: string;
  supportingDocName?: string;
  supportingDocs?: { key: string; name?: string }[];
}

/**
 * Merge wizard input onto any existing offeredComponents JSON. Only keys present
 * in `input` overwrite; the rest of the previous meta is preserved. Returns a
 * Prisma-serializable value (or undefined when there's nothing to store).
 */
export function buildOfferMeta(input: OfferMetaInput, existing?: unknown): Prisma.InputJsonValue | undefined {
  const prev: OfferMeta = existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as OfferMeta) : {};
  const next: OfferMeta = { ...prev };
  if (input.employmentType !== undefined) next.employmentType = input.employmentType;
  if (input.compensationType !== undefined) next.compensationType = input.compensationType;
  if (input.salaryStructureId !== undefined) next.salaryStructureId = input.salaryStructureId;
  if (input.salaryTemplateName !== undefined) next.salaryTemplateName = input.salaryTemplateName;
  if (input.probationPeriod !== undefined) next.probationPeriod = input.probationPeriod;
  if (input.workMode !== undefined) next.workMode = input.workMode;
  if (input.workLocation !== undefined) next.workLocation = input.workLocation;
  if (input.components !== undefined) next.components = input.components;
  // Multiple supporting docs (current). When present, this replaces the whole
  // set and clears the legacy single-doc field.
  if (input.supportingDocs !== undefined) {
    next.supportingDocs = input.supportingDocs;
    next.supportingDoc = null;
  } else if (input.supportingDocKey) {
    // Legacy single-doc path — normalise into the array form.
    next.supportingDocs = [{ key: input.supportingDocKey, name: input.supportingDocName }];
    next.supportingDoc = null;
  }
  return Object.keys(next).length ? (next as Prisma.InputJsonValue) : undefined;
}

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
