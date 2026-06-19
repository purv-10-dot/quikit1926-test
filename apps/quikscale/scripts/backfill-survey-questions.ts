/**
 * Backfill — convert single-question surveys into the multi-question shape.
 *
 * For each Survey:
 *   - If it has no SurveyQuestion rows, create one from Survey.question
 *     (answerType=nps_rank, allowComment=true, required=true, order=0).
 *
 * For each SurveyResponse:
 *   - If it has no SurveyAnswer rows, create one pointing at the survey's
 *     question #0, with scoreInt=response.score and comment=response.comment.
 *
 * Idempotent — safe to re-run; existing questions/answers are skipped.
 *
 * Run:
 *   DATABASE_URL=... npx tsx scripts/backfill-survey-questions.ts
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Backfilling survey questions + answers…\n");

  const surveys = await db.survey.findMany({
    select: { id: true, question: true, _count: { select: { questions: true, responses: true } } },
  });

  let questionsCreated = 0;
  let answersCreated   = 0;
  let surveysSkipped   = 0;

  for (const s of surveys) {
    let q0Id: string;

    if (s._count.questions === 0) {
      const q = await db.surveyQuestion.create({
        data: {
          surveyId:     s.id,
          order:        0,
          text:         s.question,
          answerType:   "nps_rank",
          allowComment: true,
          required:     true,
        },
      });
      q0Id = q.id;
      questionsCreated++;
    } else {
      const existing = await db.surveyQuestion.findFirst({
        where: { surveyId: s.id, order: 0 },
        select: { id: true },
      });
      if (!existing) {
        surveysSkipped++;
        continue;
      }
      q0Id = existing.id;
    }

    // Backfill answers for every response that doesn't have any.
    const responses = await db.surveyResponse.findMany({
      where: { surveyId: s.id, answers: { none: {} } },
      select: { id: true, score: true, comment: true },
    });

    if (responses.length === 0) continue;

    await db.surveyAnswer.createMany({
      data: responses.map((r) => ({
        responseId: r.id,
        questionId: q0Id,
        scoreInt:   r.score,
        scoreBool:  null,
        comment:    r.comment,
      })),
      skipDuplicates: true,
    });
    answersCreated += responses.length;
  }

  console.log(`✅ Surveys scanned:       ${surveys.length}`);
  console.log(`✅ Questions created:     ${questionsCreated}`);
  console.log(`✅ Answers created:       ${answersCreated}`);
  if (surveysSkipped) console.log(`⚠️  Surveys skipped:      ${surveysSkipped}`);
  console.log("\n🎉 Backfill complete.");
}

main()
  .catch((e) => {
    console.error("\n❌ Backfill failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
