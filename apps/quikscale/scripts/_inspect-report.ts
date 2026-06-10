import { PrismaClient } from "@prisma/client";
import { calcNpsBreakdown, calcYesNoBreakdown } from "../lib/schemas/surveySchema";

const db = new PrismaClient();

(async () => {
  const survey = await db.survey.findUnique({
    where: { id: "cmpf7qxbn0002jrlc4q32ws20" },
    include: {
      questions: { orderBy: { order: "asc" } },
      responses: {
        include: { answers: true },
        orderBy: { submittedAt: "desc" },
      },
    },
  });
  if (!survey) return;
  console.log(`Survey: ${survey.title}`);
  console.log(`Questions: ${survey.questions.length}, Responses: ${survey.responses.length}`);

  for (const q of survey.questions) {
    const answers = survey.responses
      .map((r) => r.answers.find((a) => a.questionId === q.id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a));
    console.log(`\nQ${q.order + 1} [${q.answerType}] ${q.text}`);
    if (q.answerType === "nps_rank") {
      const b = calcNpsBreakdown(answers.filter((a) => a.scoreInt !== null).map((a) => ({ score: a.scoreInt! })));
      console.log(`  NPS: ${b.nps}   Promoters: ${b.promoters} / Passives: ${b.passives} / Detractors: ${b.detractors}   Total: ${b.total}`);
    } else {
      const b = calcYesNoBreakdown(answers);
      console.log(`  %Yes: ${b.yesPct}%   Yes: ${b.yes} / No: ${b.no}   Total: ${b.total}`);
    }
    const comments = answers.filter((a) => a.comment).map((a) => `"${a.comment}"`);
    if (comments.length) console.log(`  Comments: ${comments.join(", ")}`);
  }
  await db.$disconnect();
})();
