/**
 * Deal Overview — single-glance summary before entering Workbench.
 *
 * Sprint 2: header, stage timeline, summary cards, recent timeline events,
 * stage-advance action. Sprint 3 adds InvestmentPulseCard with radial score
 * meters and the AI scoring breakdown.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";

import { db } from "@/lib/db";
import { STAGE_ORDER, STAGE_LABEL, type StageId } from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import AdvanceButton from "./advance-button";

export default async function DealOverviewPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) notFound();

  const deal = await db.vCDeal.findFirst({
    where: { id: params.id, tenantId },
    include: {
      vertical: { select: { name: true } },
      application: {
        select: {
          startupName: true,
          contactName: true,
          contactEmail: true,
          fundingAsk: true,
          loanType: true,
          tenureMonths: true,
          description: true,
          teamSize: true,
        },
      },
      timelineEvents: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, type: true, summary: true, createdAt: true },
      },
    },
  });
  if (!deal) notFound();

  const askLakhs =
    deal.application.fundingAsk == null
      ? null
      : Number(deal.application.fundingAsk / BigInt(10_000_000));
  const score = deal.analystScore ?? deal.aiScore;
  const stageIdx = STAGE_ORDER.indexOf(deal.currentStage as StageId);

  return (
    <div className="px-6 py-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/deals"
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          ← Pipeline
        </Link>
      </div>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {deal.application.startupName}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span>{deal.vertical.name}</span>
            <span className="text-gray-300">·</span>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
              {STAGE_LABEL[deal.currentStage as StageId]}
            </span>
            {score != null && (
              <>
                <span className="text-gray-300">·</span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium",
                    score >= 80
                      ? "bg-green-100 text-green-700"
                      : score >= 60
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700",
                  )}
                >
                  Score {score}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/deals/${deal.id}/workbench`}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Open workbench
          </Link>
          <div className="relative">
            <AdvanceButton
              dealId={deal.id}
              currentStage={deal.currentStage as StageId}
              nextStage={
                STAGE_ORDER.indexOf(deal.currentStage as StageId) <
                STAGE_ORDER.length - 1
                  ? STAGE_ORDER[STAGE_ORDER.indexOf(deal.currentStage as StageId) + 1]
                  : null
              }
            />
          </div>
        </div>
      </header>

      {/* Stage timeline */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-gray-400 mb-3">
          Stage progression
        </p>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STAGE_ORDER.map((stage, i) => {
            const isPast = i < stageIdx;
            const isCurrent = i === stageIdx;
            return (
              <div key={stage} className="flex-1 flex items-center gap-1 min-w-[100px]">
                <div
                  className={cn(
                    "h-2 flex-1 rounded-full",
                    isPast
                      ? "bg-green-500"
                      : isCurrent
                        ? "bg-blue-500"
                        : "bg-gray-200",
                  )}
                  title={STAGE_LABEL[stage]}
                />
                {i < STAGE_ORDER.length - 1 && <span className="text-gray-300 text-xs">›</span>}
              </div>
            );
          })}
        </div>
        <ol className="grid grid-cols-9 gap-1 mt-2">
          {STAGE_ORDER.map((stage, i) => (
            <li
              key={stage}
              className={cn(
                "text-[10px] text-center",
                i === stageIdx
                  ? "text-blue-700 font-semibold"
                  : i < stageIdx
                    ? "text-green-700"
                    : "text-gray-400",
              )}
            >
              {STAGE_LABEL[stage].split(" ")[0]}
            </li>
          ))}
        </ol>
      </section>

      {/* Two-column: summary + timeline */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400">Founder</p>
            <p className="text-sm text-gray-900 mt-1">
              {deal.application.contactName} ·{" "}
              <a
                href={`mailto:${deal.application.contactEmail}`}
                className="text-blue-600 hover:underline"
              >
                {deal.application.contactEmail}
              </a>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400">Description</p>
            <p className="text-sm text-gray-700 mt-1">
              {deal.application.description ?? "—"}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-gray-100">
            <SummaryCell label="Funding ask" value={askLakhs ? `₹${askLakhs}L` : "—"} />
            <SummaryCell label="Instrument" value={deal.application.loanType ?? "—"} />
            <SummaryCell
              label="Tenure"
              value={deal.application.tenureMonths ? `${deal.application.tenureMonths} mo` : "—"}
            />
            <SummaryCell
              label="Team size"
              value={deal.application.teamSize?.toString() ?? "—"}
            />
            <SummaryCell label="AI score" value={deal.aiScore?.toString() ?? "—"} />
            <SummaryCell label="Analyst score" value={deal.analystScore?.toString() ?? "—"} />
            <SummaryCell label="Docs complete" value={`${deal.docCompleteness}%`} />
            <SummaryCell label="Days in stage" value={deal.daysInStage.toString()} />
          </div>
        </div>

        <aside className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-3">
            Recent activity
          </p>
          {deal.timelineEvents.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {deal.timelineEvents.map((e) => (
                <li key={e.id} className="border-l-2 border-blue-200 pl-3">
                  <p className="text-xs text-gray-700">{e.summary}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(e.createdAt).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {e.type}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </section>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
