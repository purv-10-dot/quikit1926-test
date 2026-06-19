import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createSurveySchema, type QuestionInput } from "@/lib/schemas/surveySchema";
import { validationError } from "@/lib/api/validationError";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const GET = withOrgAuth(
  async ({ orgId }, request) => {
    const { searchParams } = new URL(request.url);
    const type    = searchParams.get("type") ?? undefined;
    const year    = searchParams.get("year")    ? Number(searchParams.get("year"))    : undefined;
    const quarter = searchParams.get("quarter") ?? undefined;

    const surveys = await db.survey.findMany({
      where: {
        orgId,
        ...(type    && { type }),
        ...(year    && { year }),
        ...(quarter && { quarter }),
      },
      include: {
        _count: { select: { responses: true, questions: true } },
        questions: { orderBy: { order: "asc" } },
      },
      orderBy: [{ year: "desc" }, { quarter: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: surveys });
  },
  { moduleKey: "survey", fallbackErrorMessage: "Failed to fetch surveys" },
);

export const POST = withOrgAuth(
  async ({ orgId }, request) => {
    const session = await getServerSession(authOptions);
    const parsed  = createSurveySchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);

    // Normalize: accept either questions[] (preferred) or legacy single `question` string.
    const questions: QuestionInput[] = parsed.data.questions ?? [
      { text: parsed.data.question!, answerType: "nps_rank", allowComment: true, required: true },
    ];

    const survey = await db.survey.create({
      data: {
        orgId,
        type:      parsed.data.type,
        title:     parsed.data.title,
        question:  questions[0]!.text, // keep legacy column populated for one release
        quarter:   parsed.data.quarter,
        year:      parsed.data.year,
        // Server-generated, unguessable token for the public share link (/s/<token>).
        // Matches the codebase convention (cf. invitationToken). `@unique` guards collisions.
        publicToken: crypto.randomUUID(),
        createdBy: session?.user?.id ?? "system",
        questions: {
          create: questions.map((q, i) => ({
            order:        i,
            text:         q.text,
            answerType:   q.answerType,
            allowComment: q.allowComment,
            required:     q.required,
          })),
        },
      },
      include: { questions: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json({ success: true, data: survey }, { status: 201 });
  },
  { moduleKey: "survey", fallbackErrorMessage: "Failed to create survey" },
);
