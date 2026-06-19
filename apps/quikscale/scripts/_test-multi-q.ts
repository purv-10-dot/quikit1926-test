import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

(async () => {
  // Re-use Moreyeahs org
  const org = await db.org.findUnique({ where: { slug: "moreyeahs" } });
  if (!org) throw new Error("No org");

  // Tidy any prior test survey with the same title
  await db.survey.deleteMany({ where: { orgId: org.id, title: "[Test] Multi-question survey" } });

  const survey = await db.survey.create({
    data: {
      orgId: org.id,
      type: "enps",
      title: "[Test] Multi-question survey",
      question: "How likely are you to recommend us?",
      quarter: "Q1",
      year: 2026,
      status: "active",
      createdBy: "system",
      questions: {
        create: [
          { order: 0, text: "How likely are you to recommend us?", answerType: "nps_rank", allowComment: true,  required: true },
          { order: 1, text: "Would you renew next quarter?",       answerType: "yes_no",   allowComment: false, required: true },
          { order: 2, text: "Any feedback for the team?",           answerType: "yes_no",   allowComment: true,  required: false },
        ],
      },
    },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  console.log("Survey:", survey.id, "/s/" + survey.publicToken);
  for (const q of survey.questions) console.log(`  ${q.id}  Q${q.order + 1} [${q.answerType}] req=${q.required} comment=${q.allowComment}`);
  await db.$disconnect();
})();
