import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const r = await db.surveyResponse.findUnique({
    where: { id: "cmpf7pac20001qakiu0tyca5j" },
    include: { answers: { include: { question: { select: { text: true, answerType: true } } } } },
  });
  console.log(JSON.stringify(r, null, 2));
  await db.$disconnect();
})();
