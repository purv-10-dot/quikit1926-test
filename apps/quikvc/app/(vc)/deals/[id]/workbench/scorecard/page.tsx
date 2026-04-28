/**
 * Scorecard tab — per-criterion AI score + analyst override.
 *
 * Sprint 3a: read-only listing of AI scores from VCDealScore. Sprint 3b
 * adds inline override editor + score trend chart.
 */
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

export default async function ScorecardPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) notFound();

  const deal = await db.vCDeal.findFirst({
    where: { id: params.id, tenantId },
    select: {
      id: true,
      verticalId: true,
      aiScore: true,
      analystScore: true,
      scores: {
        select: {
          criterionSlug: true,
          aiScore: true,
          analystScore: true,
          overrideReason: true,
        },
      },
    },
  });
  if (!deal) notFound();

  const criteria = await db.vCScoringCriterion.findMany({
    where: { tenantId, verticalId: deal.verticalId },
    select: { slug: true, name: true, description: true, weight: true },
    orderBy: { sortOrder: "asc" },
  });

  // Map criterion slug → score row
  const scoreBySlug = Object.fromEntries(deal.scores.map((s) => [s.criterionSlug, s]));

  const composite = deal.analystScore ?? deal.aiScore;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Scorecard</h2>
          <p className="text-sm text-gray-500 mt-1">
            AI-generated scores per criterion. Override with rationale to lock
            an analyst-final score.
          </p>
        </div>
        {composite != null && (
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-400">Composite</p>
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                composite >= 80
                  ? "text-green-600"
                  : composite >= 60
                    ? "text-amber-600"
                    : "text-red-600",
              )}
            >
              {composite}
            </span>
          </div>
        )}
      </header>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-left">Criterion</th>
              <th className="px-4 py-2.5 text-center">Weight</th>
              <th className="px-4 py-2.5 text-center">AI</th>
              <th className="px-4 py-2.5 text-center">Analyst</th>
              <th className="px-4 py-2.5 text-left">Override reason</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((c) => {
              const s = scoreBySlug[c.slug];
              const finalScore = s?.analystScore ?? s?.aiScore ?? null;
              return (
                <tr key={c.slug} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {c.description && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {c.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">{c.weight}%</td>
                  <td className="px-4 py-3 text-center">
                    {s?.aiScore != null ? (
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          s.aiScore >= 80
                            ? "text-green-600"
                            : s.aiScore >= 60
                              ? "text-amber-600"
                              : "text-red-600",
                        )}
                      >
                        {s.aiScore}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s?.analystScore != null ? (
                      <span className="text-sm font-semibold text-blue-600 tabular-nums">
                        {s.analystScore}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">
                    {s?.overrideReason ?? <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs text-blue-800">
          <strong>Sprint 3a:</strong> AI scores auto-populate on application
          submit (Claude Sonnet). Analyst override editor + score trend chart
          ship in Sprint 3b. Re-trigger scoring from this tab in Sprint 3b.
        </p>
      </div>
    </div>
  );
}
