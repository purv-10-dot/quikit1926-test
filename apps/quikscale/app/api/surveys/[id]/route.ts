import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { updateSurveySchema } from "@/lib/schemas/surveySchema";
import { validationError } from "@/lib/api/validationError";
import { withTxRetry } from "@/lib/api/withTxRetry";

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const survey = await db.survey.findFirst({
      where: { id: params.id, orgId },
      include: {
        _count: { select: { responses: true, questions: true } },
        questions: { orderBy: { order: "asc" } },
      },
    });
    if (!survey) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: survey });
  },
  { moduleKey: "survey", fallbackErrorMessage: "Failed to fetch survey" },
);

export const PUT = withOrgAuth<{ id: string }>(
  async ({ orgId }, request, { params }) => {
    const existing = await db.survey.findFirst({
      where: { id: params.id, orgId },
      include: { _count: { select: { responses: true, questions: true } } },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const parsed = updateSurveySchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);

    const hasResponses = existing._count.responses > 0;

    // Apply basic field updates
    await db.survey.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.title  !== undefined && { title:  parsed.data.title }),
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
      },
    });

    // Append new questions (allowed even if responses exist — new questions just have no data yet).
    if (parsed.data.addQuestions?.length) {
      const startOrder = existing._count.questions;
      await db.surveyQuestion.createMany({
        data: parsed.data.addQuestions.map((q, i) => ({
          surveyId:     params.id,
          order:        startOrder + i,
          text:         q.text,
          answerType:   q.answerType,
          allowComment: q.allowComment,
          required:     q.required,
        })),
      });
    }

    // Reorder existing questions.
    if (parsed.data.reorder?.length) {
      // Sort by question id so two concurrent reorders of the same survey
      // acquire row locks in a consistent order — prevents deadlocks on the
      // (surveyId, order) unique index. The final `order` written is identical
      // regardless of statement order, so this is behavior-preserving.
      const ordered = [...parsed.data.reorder].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      );
      // Re-order in two passes (negative offset, then final order) to avoid unique-constraint clashes.
      // Retried as a unit if Postgres picks this tx as a deadlock victim.
      await withTxRetry(() =>
        db.$transaction([
          ...ordered.map((r) =>
            db.surveyQuestion.update({
              where: { id: r.id },
              data: { order: -1 - r.order },
            }),
          ),
          ...ordered.map((r) =>
            db.surveyQuestion.update({
              where: { id: r.id },
              data: { order: r.order },
            }),
          ),
        ]),
      );
    }

    const updated = await db.survey.findFirst({
      where: { id: params.id, orgId },
      include: {
        _count: { select: { responses: true, questions: true } },
        questions: { orderBy: { order: "asc" } },
      },
    });
    return NextResponse.json({ success: true, data: updated, hadResponses: hasResponses });
  },
  { moduleKey: "survey", fallbackErrorMessage: "Failed to update survey" },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const existing = await db.survey.findFirst({ where: { id: params.id, orgId } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    await db.survey.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  },
  { moduleKey: "survey", fallbackErrorMessage: "Failed to delete survey" },
);
