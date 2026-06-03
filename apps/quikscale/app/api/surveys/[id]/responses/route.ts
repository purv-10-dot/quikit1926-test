import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const survey = await db.survey.findFirst({ where: { id: params.id, orgId } });
    if (!survey) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const responses = await db.surveyResponse.findMany({
      where: { surveyId: params.id },
      orderBy: { submittedAt: "desc" },
      include: {
        answers: {
          select: { questionId: true, scoreInt: true, scoreBool: true, comment: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: responses });
  },
  { moduleKey: "survey", fallbackErrorMessage: "Failed to fetch responses" },
);
