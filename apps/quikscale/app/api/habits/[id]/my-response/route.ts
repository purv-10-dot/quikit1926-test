import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { submitResponseSchema } from "@/lib/schemas/habitSchema";
import { validationError } from "@/lib/api/validationError";

/**
 * GET /api/habits/[id]/my-response
 *
 * Any member with the Habits module enabled. Returns the caller's own
 * response so the fill form can pre-fill if they reopen it. 404 if they
 * haven't submitted yet. Never returns anyone else's data.
 */
export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const campaign = await db.habitAssessment.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, status: true, isLegacy: true },
    });
    if (!campaign || campaign.isLegacy) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const response = await db.habitAssessmentResponse.findUnique({
      where: {
        habitAssessmentId_respondentUserId: {
          habitAssessmentId: params.id,
          respondentUserId: userId,
        },
      },
      select: { subItemBits: true, submittedAt: true, updatedAt: true },
    });
    if (!response) {
      return NextResponse.json({ success: false, error: "No response yet" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: response });
  },
  { moduleKey: "habits", fallbackErrorMessage: "Failed to load response" },
);

/**
 * PUT /api/habits/[id]/my-response
 *
 * Create the caller's own response. ONE-SHOT — once submitted, the response
 * is locked (no edit, no delete). Returns 409 if a response already exists.
 *
 * Rejects when the campaign is not "active" or when the deadline has passed.
 * Admins can extend the deadline via PUT /api/habits/[id] to reopen the
 * window for members who haven't submitted yet.
 */
export const PUT = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, request, { params }) => {
    const parsed = submitResponseSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const { subItemBits } = parsed.data;

    const campaign = await db.habitAssessment.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, status: true, deadline: true, isLegacy: true },
    });
    if (!campaign || campaign.isLegacy) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (campaign.status !== "active") {
      return NextResponse.json(
        { success: false, error: "This assessment is not accepting responses right now" },
        { status: 400 },
      );
    }
    if (campaign.deadline) {
      // Deadlines are stored as the date picker's midnight value but should
      // mean "submissions allowed through end of that day". Add 24h so a
      // deadline of "May 22" stays open all of May 22 in any timezone.
      const cutoff = campaign.deadline.getTime() + 24 * 60 * 60 * 1000;
      if (cutoff < Date.now()) {
        return NextResponse.json(
          { success: false, error: "The deadline for this assessment has passed" },
          { status: 400 },
        );
      }
    }

    const alreadySubmitted = await db.habitAssessmentResponse.findUnique({
      where: {
        habitAssessmentId_respondentUserId: {
          habitAssessmentId: params.id,
          respondentUserId: userId,
        },
      },
      select: { id: true },
    });
    if (alreadySubmitted) {
      return NextResponse.json(
        { success: false, error: "You have already submitted this assessment. Submissions are final." },
        { status: 409 },
      );
    }

    const created = await db.habitAssessmentResponse.create({
      data: {
        habitAssessmentId: params.id,
        respondentUserId: userId,
        subItemBits,
      },
      select: { submittedAt: true, updatedAt: true },
    });

    return NextResponse.json({ success: true, data: created });
  },
  { moduleKey: "habits", fallbackErrorMessage: "Failed to submit response" },
);
