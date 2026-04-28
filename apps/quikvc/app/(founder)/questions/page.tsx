/**
 * Founder Questions — view + answer questions posted by the analyst.
 *
 * Open questions go to the top; answered questions to the bottom.
 */
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import QuestionsClient from "./questions-client";

export default async function FounderQuestionsPage() {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  if (!tenantId || !userId) {
    return <div className="px-4 py-5 text-sm text-gray-500">Sign in required.</div>;
  }

  const application = await db.vCApplication.findFirst({
    where: { tenantId, founderId: userId },
    orderBy: { createdAt: "desc" },
    select: { deal: { select: { id: true } } },
  });
  if (!application?.deal) {
    return (
      <div className="px-4 py-5 max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold text-gray-900">Questions</h1>
        <p className="mt-2 text-sm text-gray-500">
          Questions appear here once the analyst posts them.
        </p>
      </div>
    );
  }

  const questions = await db.vCDealQuestion.findMany({
    where: { tenantId, dealId: application.deal.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true, question: true, answer: true, status: true,
      createdAt: true, answeredAt: true,
    },
  });

  return (
    <div className="px-4 py-5 max-w-3xl mx-auto">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Questions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Reply to questions from the analyst.
        </p>
      </header>
      <QuestionsClient
        questions={questions.map((q) => ({
          ...q,
          createdAt: q.createdAt.toISOString(),
          answeredAt: q.answeredAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
