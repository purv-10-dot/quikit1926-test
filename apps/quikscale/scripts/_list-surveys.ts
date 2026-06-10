import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const surveys = await db.survey.findMany({
    include: { _count: { select: { questions: true, responses: true } }, questions: { orderBy: { order: "asc" }, take: 3 } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const s of surveys) {
    console.log(`${s.id}  ${s.type}  ${s.status}  /s/${s.publicToken}`);
    console.log(`  title: ${s.title}`);
    console.log(`  questions: ${s._count.questions}, responses: ${s._count.responses}`);
    for (const q of s.questions) console.log(`    Q${q.order + 1} [${q.answerType}] ${q.text.slice(0, 60)}`);
  }
  await db.$disconnect();
})();
