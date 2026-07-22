import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, notFound, internalError } from "@/lib/api-response";
import { createOfferSchema } from "@/lib/validations/recruit";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { offerSelect, offerFromApplication, buildOfferMeta } from "@/lib/recruit/offer-shape";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const status = searchParams.get("status");

    // Offers now live on JobApplication (offerStatus != null = has an offer).
    const where = {
      orgId, deletedAt: null,
      offerStatus: status ? (status as "OfferSent" | "OfferAccepted") : { not: null },
    };

    const [apps, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where, orderBy: { offerCreatedAt: "desc" }, skip: (page - 1) * limit, take: limit,
        select: {
          ...offerSelect,
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
          requisition: { select: { id: true, title: true, requisitionNumber: true } },
        },
      }),
      prisma.jobApplication.count({ where }),
    ]);

    // Attach PostOffer doc request status per offer (for UI button gating)
    const appIds = apps.map((a) => a.id);
    const docRequests = appIds.length
      ? await prisma.candidateDocumentRequest.findMany({
          where: { orgId, applicationId: { in: appIds }, bundle: "PostOffer", deletedAt: null },
          select: { applicationId: true, status: true, lastReminderAt: true, reminderCount: true },
        })
      : [];
    const docMap = new Map(docRequests.map((r) => [r.applicationId, r]));
    const enriched = apps.map((a) => ({
      ...offerFromApplication(a)!,
      application: { id: a.id, candidate: a.candidate, requisition: a.requisition },
      docRequest: docMap.get(a.id) ?? null,
    }));

    return successResponse(enriched, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /recruit/offers error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createOfferSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;

    // Verify the application exists in this org first — otherwise a bad/cross-org
    // id falls through to a bare update() that throws P2025 → generic 500.
    const app = await prisma.jobApplication.findFirst({
      where: { id: data.applicationId, orgId, deletedAt: null },
      select: { id: true, offerStatus: true },
    });
    if (!app) return notFound("Application not found");
    if (app.offerStatus != null) {
      return conflict("An offer already exists for this candidate. Edit the existing offer instead.");
    }

    // Offer lives on the application now; drafting it sets offerStatus + the app
    // status in a single write.
    const updatedApp = await prisma.jobApplication.update({
      where: { id: data.applicationId },
      data: {
        offerStatus: "OfferDraft",
        offerDesignation: data.designation, offerDepartmentId: data.departmentId, offerReportingToId: data.reportingToId,
        offeredCTC: data.offeredCTC, offerJoiningDate: new Date(data.joiningDate),
        offerJoiningBonus: data.joiningBonus, offerRelocationBonus: data.relocationBonus, offerEquityGrant: data.equityGrant,
        offerExpiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        offeredComponents: buildOfferMeta(data),
        offerCreatedAt: new Date(), offerCreatedBy: userId,
        status: "AppOffered",
        updatedBy: userId,
      },
      select: {
        ...offerSelect,
        candidate: { select: { firstName: true, lastName: true, email: true } },
        requisition: { select: { title: true } },
      },
    });
    const offer = {
      ...offerFromApplication(updatedApp)!,
      application: { candidate: updatedApp.candidate, requisition: updatedApp.requisition },
    };

    // Auto-advance the candidate to the "Offer" stage in their pipeline so
    // the pipeline view stays in sync with the Offers list. Uses the
    // candidate's own pipeline (multi-pipeline orgs), falling back to default.
    try {
      const app = await prisma.jobApplication.findUnique({
        where: { id: data.applicationId },
        select: { currentStage: true, stageHistory: true, requisition: { select: { pipelineId: true } } },
      });
      if (app) {
        const pipeline = app.requisition.pipelineId
          ? await prisma.hiringPipeline.findUnique({ where: { id: app.requisition.pipelineId } })
          : await prisma.hiringPipeline.findFirst({ where: { orgId, deletedAt: null, isDefault: true } });
        const stageNamesArr: string[] = Array.isArray(pipeline?.stages)
          ? (pipeline!.stages as Array<{ name: string }>).map((s) => s.name)
          : [];
        const offerStage = stageNamesArr.find((s) => /^offer/i.test(s));
        if (offerStage && app.currentStage !== offerStage) {
          const history = Array.isArray(app.stageHistory) ? (app.stageHistory as unknown[]) : [];
          await prisma.jobApplication.update({
            where: { id: data.applicationId },
            data: {
              currentStage: offerStage,
              stageHistory: JSON.parse(JSON.stringify([
                ...history,
                { stage: offerStage, date: new Date().toISOString(), movedBy: userId, reason: "Offer created" },
              ])),
              updatedBy: userId,
            },
          });
        }
      }
    } catch (e) {
      console.error("[offer-create] pipeline auto-advance failed:", e);
    }

    // NOTE: offer email is NOT auto-sent. Trigger via POST /api/v1/hrms/mail/offer after user confirms.

    return successResponse(offer, undefined, 201);
  } catch (error) { console.error("POST /recruit/offers error:", error); return internalError(); }
});
