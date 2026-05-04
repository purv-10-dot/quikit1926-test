/**
 * /api/questions
 *
 *   POST  — analyst posts a new question against a deal
 *   PATCH — founder answers an existing question
 *
 * Both writes append a VCTimelineEvent for transparency.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

const postSchema = z.object({
  dealId: z.string().min(1),
  question: z.string().min(3).max(2000),
});

const patchSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().min(1).max(5000),
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { dealId, question } = parsed.data;

  // Confirm deal belongs to caller's tenant
  const deal = await db.vCDeal.findFirst({ where: { id: dealId, orgId } });
  if (!deal) {
    return NextResponse.json({ success: false, error: "Deal not found" }, { status: 404 });
  }

  const [q] = await db.$transaction([
    db.vCDealQuestion.create({
      data: {
        orgId,
        dealId,
        askedById: userId,
        question,
        status: "open",
        createdBy: userId,
        updatedBy: userId,
      },
      select: { id: true, question: true, status: true, createdAt: true },
    }),
    db.vCTimelineEvent.create({
      data: {
        orgId,
        dealId,
        type: "question-asked",
        actorId: userId,
        summary: `New question for the founder`,
        visibility: "founder",
      },
    }),
  ]);

  return NextResponse.json({ success: true, data: q }, { status: 201 });
});

export const PATCH = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { questionId, answer } = parsed.data;

  const existing = await db.vCDealQuestion.findFirst({
    where: { id: questionId, orgId },
    select: { id: true, dealId: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Question not found" }, { status: 404 });
  }
  if (existing.status === "closed") {
    return NextResponse.json(
      { success: false, error: "Question is closed" },
      { status: 409 },
    );
  }

  const [q] = await db.$transaction([
    db.vCDealQuestion.update({
      where: { id: questionId },
      data: {
        answer,
        answeredById: userId,
        answeredAt: new Date(),
        status: "answered",
        updatedBy: userId,
      },
      select: { id: true, status: true, answer: true, answeredAt: true },
    }),
    db.vCTimelineEvent.create({
      data: {
        orgId,
        dealId: existing.dealId,
        type: "question-answered",
        actorId: userId,
        summary: `Founder answered a question`,
        visibility: "internal",
      },
    }),
  ]);

  return NextResponse.json({ success: true, data: q });
});
