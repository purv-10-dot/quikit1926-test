import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { submitResponseSchema } from "@/lib/schemas/surveySchema";
import { validationError } from "@/lib/api/validationError";

// Public — no auth required

export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const survey = await db.survey.findUnique({
    where: { publicToken: params.token },
    select: {
      id: true,
      type: true,
      title: true,
      question: true, // legacy fallback
      quarter: true,
      year: true,
      status: true,
      org: { select: { name: true } },
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          text: true,
          answerType: true,
          allowComment: true,
          required: true,
        },
      },
    },
  });
  if (!survey) return NextResponse.json({ success: false, error: "Survey not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: survey });
}

export async function POST(
  request: Request,
  { params }: { params: { token: string } },
) {
  const survey = await db.survey.findUnique({
    where: { publicToken: params.token },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!survey) return NextResponse.json({ success: false, error: "Survey not found" }, { status: 404 });
  if (survey.status !== "active") {
    return NextResponse.json({ success: false, error: "This survey is not accepting responses" }, { status: 403 });
  }

  const parsed = submitResponseSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);

  // Resolve answers: prefer the new answers[] payload; fall back to legacy { score, comment }.
  type AnswerRow = { questionId: string; scoreInt: number | null; scoreBool: boolean | null; comment: string | null };
  let answers: AnswerRow[];

  if (parsed.data.answers?.length) {
    const byId = new Map(survey.questions.map((q) => [q.id, q]));
    // Validate each answer references a real question and matches its answerType.
    for (const a of parsed.data.answers) {
      const q = byId.get(a.questionId);
      if (!q) {
        return NextResponse.json({ success: false, error: `Unknown questionId: ${a.questionId}` }, { status: 400 });
      }
      if (q.answerType === "nps_rank" && a.scoreInt === undefined) {
        return NextResponse.json({ success: false, error: `Question "${q.text}" requires an NPS score` }, { status: 400 });
      }
      if (q.answerType === "yes_no" && a.scoreBool === undefined) {
        return NextResponse.json({ success: false, error: `Question "${q.text}" requires a yes/no answer` }, { status: 400 });
      }
    }
    // Enforce required questions are all answered.
    const answeredIds = new Set(parsed.data.answers.map((a) => a.questionId));
    for (const q of survey.questions) {
      if (q.required && !answeredIds.has(q.id)) {
        return NextResponse.json({ success: false, error: `Required question missing: "${q.text}"` }, { status: 400 });
      }
    }
    answers = parsed.data.answers.map((a) => ({
      questionId: a.questionId,
      scoreInt:   a.scoreInt ?? null,
      scoreBool:  a.scoreBool ?? null,
      comment:    a.comment ?? null,
    }));
  } else {
    // Legacy path — single-score payload. Attach to question #0.
    const q0 = survey.questions[0];
    if (!q0) {
      return NextResponse.json({ success: false, error: "Survey has no questions" }, { status: 500 });
    }
    answers = [{
      questionId: q0.id,
      scoreInt:   parsed.data.score!,
      scoreBool:  null,
      comment:    parsed.data.comment ?? null,
    }];
  }

  // Legacy column values — use the first nps_rank answer (if any) so old code paths still see something sensible.
  const primaryNps = answers.find((a) => a.scoreInt !== null);

  const response = await db.surveyResponse.create({
    data: {
      surveyId:        survey.id,
      score:           primaryNps?.scoreInt ?? 0,
      comment:         primaryNps?.comment ?? parsed.data.comment ?? null,
      respondentName:  parsed.data.respondentName ?? null,
      respondentEmail: parsed.data.respondentEmail || null,
      answers: {
        create: answers,
      },
    },
  });

  return NextResponse.json({ success: true, data: { id: response.id } }, { status: 201 });
}
