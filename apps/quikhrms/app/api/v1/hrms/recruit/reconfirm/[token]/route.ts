import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyReconfirmToken } from "@/lib/services/reconfirm-token";
import { notifyCandidateReconfirm } from "@/lib/services/requisition-notifications";

const ok = <T>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });
const err = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

async function loadByToken(token: string) {
  const payload = verifyReconfirmToken(token);
  if (!payload) return { error: "This link is invalid or has expired." as const };

  const app = await prisma.jobApplication.findFirst({
    where: { id: payload.applicationId, orgId: payload.orgId, deletedAt: null },
    select: {
      id: true, status: true, reconfirmSentAt: true, candidateId: true, requisitionId: true,
      candidate: { select: { firstName: true, lastName: true } },
      requisition: { select: { title: true, recruiterId: true, hiringManagerId: true } },
    },
  });
  if (!app) return { error: "We couldn't find your application." as const };
  return { app, orgId: payload.orgId };
}

// derive a friendly state for the page
function stateOf(status: string, reconfirmSentAt: Date | null): "pending" | "confirmed" | "withdrawn" | "closed" {
  if (status === "AppActive" || status === "AppOffered") return "confirmed";
  if (status === "AppWithdrawn") return "withdrawn";
  if (status === "AppOnHold" && reconfirmSentAt) return "pending";
  return "closed";
}

/** GET — validate the link and return candidate/role info + current state. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await loadByToken(token);
  if (r.error) return err("INVALID_TOKEN", r.error, 400);

  const company = await prisma.companySettings.findUnique({
    where: { orgId: r.orgId }, select: { companyName: true },
  });

  return ok({
    candidateName: `${r.app.candidate.firstName} ${r.app.candidate.lastName}`.trim(),
    jobTitle: r.app.requisition?.title ?? "the role",
    companyName: company?.companyName ?? "Our Company",
    state: stateOf(r.app.status, r.app.reconfirmSentAt),
  });
}

const answerSchema = z.object({ answer: z.enum(["yes", "no"]) });

/** POST { answer } — record the candidate's decision. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = answerSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("BAD_INPUT", "Invalid response.", 400);

  const r = await loadByToken(token);
  if (r.error) return err("INVALID_TOKEN", r.error, 400);
  const { app, orgId } = r;

  const state = stateOf(app.status, app.reconfirmSentAt);
  if (state !== "pending") {
    // Already handled (or no longer awaiting) — report the current state so the
    // page can show the right message instead of double-applying.
    return ok({ state });
  }

  const candidateName = `${app.candidate.firstName} ${app.candidate.lastName}`.trim();
  const reqTitle = app.requisition?.title ?? "the role";

  if (parsed.data.answer === "yes") {
    await prisma.jobApplication.update({
      where: { id: app.id },
      data: { status: "AppActive", reconfirmSentAt: null },
    });
    await prisma.candidate.update({
      where: { id: app.candidateId },
      data: { isArchived: false, archiveReason: null, archivedAt: null, archivedBy: null, status: "InPipeline" },
    }).catch(() => null);
    void notifyCandidateReconfirm(orgId, {
      requisitionId: app.requisitionId, requisitionTitle: reqTitle, candidateName,
      interested: true, recipients: [app.requisition?.recruiterId, app.requisition?.hiringManagerId],
    }).catch(() => {});
    return ok({ state: "confirmed" });
  }

  // "No" — withdraw (penalty-free; stays archived).
  await prisma.jobApplication.update({
    where: { id: app.id },
    data: { status: "AppWithdrawn", reconfirmSentAt: null },
  });
  void notifyCandidateReconfirm(orgId, {
    requisitionId: app.requisitionId, requisitionTitle: reqTitle, candidateName,
    interested: false, recipients: [app.requisition?.recruiterId, app.requisition?.hiringManagerId],
  }).catch(() => {});
  return ok({ state: "withdrawn" });
}
