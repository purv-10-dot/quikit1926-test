import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOfferResponseToken } from "@/lib/services/offer-response-token";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildOfferResponseEmail } from "@/lib/email-templates/offer-response";
import { publishNotification } from "@/lib/services/realtime";
import { rateLimitOrResponse, clientIp } from "@/lib/rate-limit";
import { convertApplicationToEmployee } from "@/lib/services/onboard-application";

// PUBLIC (token-gated, no login) — the offer accept/decline page a candidate
// opens from the emailed link. Mirrors the exit-interview token flow.

const ok = <T,>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });
const err = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

async function loadOffer(token: string) {
  const payload = verifyOfferResponseToken(token);
  if (!payload) return null;
  const app = await prisma.jobApplication.findFirst({
    where: { id: payload.applicationId, orgId: payload.orgId, deletedAt: null, offerStatus: { not: null } },
    select: {
      id: true, orgId: true, offerStatus: true, currentStage: true, stageHistory: true,
      offerDesignation: true, offeredCTC: true, offerJoiningDate: true, offerExpiresAt: true,
      candidate: { select: { firstName: true, lastName: true, email: true } },
      requisition: { select: { title: true, createdById: true, raisedById: true } },
    },
  });
  return app ? { app, orgId: payload.orgId } : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimitOrResponse("recruit.offer-response.get", clientIp(req), 40, 60);
  if (rl) return rl;
  const { token } = await params;
  const ctx = await loadOffer(token);
  if (!ctx) return err("INVALID_TOKEN", "This offer link is invalid or has expired.", 400);
  const { app, orgId } = ctx;

  const company = await prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } });

  const expired = app.offerExpiresAt ? new Date() > new Date(app.offerExpiresAt) : false;

  return ok({
    companyName: company?.companyName ?? "Our Company",
    candidateName: `${app.candidate.firstName} ${app.candidate.lastName}`.trim(),
    jobTitle: app.requisition?.title ?? app.offerDesignation ?? "",
    designation: app.offerDesignation ?? "",
    offeredCTC: app.offeredCTC ? Number(app.offeredCTC) : null,
    joiningDate: app.offerJoiningDate,
    expiresAt: app.offerExpiresAt,
    expired,
    // Only "OfferSent" is actionable by the candidate.
    status: app.offerStatus,
    decided: app.offerStatus === "OfferAccepted" || app.offerStatus === "OfferDeclined",
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimitOrResponse("recruit.offer-response.post", clientIp(req), 12, 60);
  if (rl) return rl;
  const { token } = await params;
  const ctx = await loadOffer(token);
  if (!ctx) return err("INVALID_TOKEN", "This offer link is invalid or has expired.", 400);
  const { app } = ctx;

  if (app.offerStatus === "OfferAccepted" || app.offerStatus === "OfferDeclined") {
    return err("ALREADY_DECIDED", "You have already responded to this offer.", 409);
  }
  if (app.offerStatus !== "OfferSent") {
    return err("NOT_SENT", "This offer isn't ready for a response yet.", 409);
  }
  if (app.offerExpiresAt && new Date() > new Date(app.offerExpiresAt)) {
    return err("EXPIRED", "This offer has expired. Please contact HR.", 409);
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action as "accept" | "decline" | undefined;
  const reason = typeof body?.reason === "string" ? body.reason : undefined;
  if (action !== "accept" && action !== "decline") {
    return err("BAD_ACTION", "Choose accept or decline.", 400);
  }

  const accepted = action === "accept";
  const data: Record<string, unknown> = {
    offerStatus: accepted ? "OfferAccepted" : "OfferDeclined",
    offerRespondedAt: new Date(),
  };
  if (!accepted && reason) data.offerDeclineReason = reason;

  // Mirror HR-side status flips: accept → move to Hired stage; decline → drop
  // from the active board.
  if (accepted && app.currentStage !== "Hired") {
    const hist = Array.isArray(app.stageHistory) ? (app.stageHistory as unknown[]) : [];
    data.currentStage = "Hired";
    data.stageHistory = JSON.parse(JSON.stringify([
      ...hist,
      { stage: "Hired", date: new Date().toISOString(), movedBy: "candidate", reason: "Offer accepted by candidate" },
    ]));
  }
  if (!accepted) data.status = "AppDeclined";

  await prisma.jobApplication.update({ where: { id: app.id }, data });

  // Auto-convert to Employee the moment the candidate accepts — no HR click
  // needed. The Employee stays hidden (status "PreBoarding") from the
  // directory and Pipeline's Hired column until HR later clicks "Confirm
  // Employee" at the end of the Onboarding checklist. Best-effort: never
  // blocks the candidate's own accept/decline response.
  if (accepted) {
    try {
      await convertApplicationToEmployee(app.orgId, "candidate-offer-accept", app.id);
    } catch (e) {
      console.error("auto-onboard on candidate offer-accept failed:", e);
    }
  }

  void fireWorkflow({
    orgId: app.orgId,
    event: accepted ? "recruit.offer.accepted" : "recruit.offer.rejected",
    payload: { offerId: app.id, applicationId: app.id, by: "candidate" },
  });

  // Notify the recruiter / requisition owner in-app (best-effort — never blocks).
  try {
    const candidateName = `${app.candidate.firstName} ${app.candidate.lastName}`.trim();
    const jobTitle = app.requisition?.title ?? app.offerDesignation ?? "the role";
    const recipients = [...new Set(
      [app.requisition?.createdById, app.requisition?.raisedById].filter((x): x is string => !!x),
    )];
    if (recipients.length) {
      await prisma.hrmsNotification.createMany({
        data: recipients.map((employeeId) => ({
          orgId: app.orgId,
          employeeId,
          type: accepted ? ("Success" as const) : ("Warning" as const),
          channel: "InApp" as const,
          title: accepted ? "Offer accepted" : "Offer declined",
          message: accepted
            ? `${candidateName} accepted the offer for ${jobTitle}. Ready to onboard.`
            : `${candidateName} declined the offer for ${jobTitle}.`,
          link: "/recruit/pipeline",
          entityType: "JobApplication",
          entityId: app.id,
        })),
      });
      publishNotification(app.orgId, recipients, {
        title: accepted ? "Offer accepted" : "Offer declined",
        message: accepted
          ? `${candidateName} accepted the offer for ${jobTitle}.`
          : `${candidateName} declined the offer for ${jobTitle}.`,
        type: accepted ? "Success" : "Warning",
        link: "/recruit/pipeline",
      }).catch(() => {});
    }
  } catch (e) {
    console.error("[offer-response] HR notification failed:", e);
  }

  // Confirmation email to the candidate (best-effort — never block the response).
  if (app.candidate.email) {
    try {
      const company = await prisma.companySettings.findUnique({ where: { orgId: app.orgId }, select: { companyName: true } });
      const companyName = company?.companyName ?? "Our Company";
      const candidateName = `${app.candidate.firstName} ${app.candidate.lastName}`.trim();
      const jobTitle = app.requisition?.title ?? app.offerDesignation ?? "the role";
      await resolveAndSend(app.orgId, {
        key: accepted ? "recruit.offer-accepted" : "recruit.offer-declined",
        to: app.candidate.email,
        vars: { candidateName, companyName, jobTitle },
        fallback: () => buildOfferResponseEmail({ candidateName, companyName, jobTitle, accepted }),
      });
    } catch (e) {
      console.error("[offer-response] confirmation email failed:", e);
    }
  }

  return ok({ recorded: true, accepted });
}
