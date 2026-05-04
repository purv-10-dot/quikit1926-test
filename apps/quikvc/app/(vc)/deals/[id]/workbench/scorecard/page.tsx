/**
 * Scorecard tab — per-criterion AI score + analyst override.
 *
 * Sprint 3a: read-only listing.
 * Sprint 3b: inline override editor (this commit) — analyst types a number
 * + justification per criterion, server recomputes the composite.
 */
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import ScorecardTable from "./scorecard-table";

export default async function ScorecardPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  if (!orgId) notFound();

  const deal = await db.vCDeal.findFirst({
    where: { id: params.id, orgId },
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
    where: { orgId, verticalId: deal.verticalId },
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

      <ScorecardTable
        dealId={params.id}
        rows={criteria.map((c) => ({
          criterionSlug: c.slug,
          criterionName: c.name,
          description: c.description,
          weight: c.weight,
          aiScore: scoreBySlug[c.slug]?.aiScore ?? null,
          analystScore: scoreBySlug[c.slug]?.analystScore ?? null,
          overrideReason: scoreBySlug[c.slug]?.overrideReason ?? null,
        }))}
      />
    </div>
  );
}
