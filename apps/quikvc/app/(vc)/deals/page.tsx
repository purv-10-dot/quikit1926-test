/**
 * Pipeline view — Kanban with 6 columns grouping the 9 canonical stages.
 *
 * Sprint 2: server-rendered, no drag-and-drop yet (stage advance happens
 * via Deal Overview action button). Sprint 3 wires real-time + DnD.
 */
import Link from "next/link";
import { getDevAwareSession } from "@/lib/dev-session";

import { db } from "@/lib/db";
import { KANBAN_COLUMNS, STAGE_LABEL, type StageId } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

interface DealCard {
  id: string;
  startupName: string;
  verticalName: string;
  currentStage: StageId;
  aiScore: number | null;
  analystScore: number | null;
  docCompleteness: number;
  daysInStage: number;
  fundingAsk: bigint | null;
}

async function loadDeals(orgId: string): Promise<DealCard[]> {
  const rows = await db.vCDeal.findMany({
    where: { orgId },
    select: {
      id: true,
      currentStage: true,
      aiScore: true,
      analystScore: true,
      docCompleteness: true,
      daysInStage: true,
      vertical: { select: { name: true } },
      application: { select: { startupName: true, fundingAsk: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((d) => ({
    id: d.id,
    startupName: d.application.startupName,
    verticalName: d.vertical.name,
    currentStage: d.currentStage as StageId,
    aiScore: d.aiScore,
    analystScore: d.analystScore,
    docCompleteness: d.docCompleteness,
    daysInStage: d.daysInStage,
    fundingAsk: d.application.fundingAsk,
  }));
}

export default async function DealsPipelinePage() {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  const deals = orgId ? await loadDeals(orgId) : [];

  return (
    <div className="px-6 py-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Deal Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">
            {deals.length} {deals.length === 1 ? "deal" : "deals"} across the pipeline.
            Click a card to open the deal workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            Filters
          </button>
          <Link
            href="/sourcing"
            className="text-xs px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          >
            + New Deal
          </Link>
        </div>
      </header>

      <div className="overflow-x-auto pb-2">
        <div className="grid grid-flow-col auto-cols-[280px] gap-3" role="list">
          {KANBAN_COLUMNS.map((col) => {
            const dealsInCol = deals.filter((d) => col.stages.includes(d.currentStage));
            return (
              <div
                key={col.id}
                className="bg-gray-100 rounded-xl flex flex-col min-h-[400px]"
              >
                <div className="px-3 py-2.5 flex items-center justify-between border-b border-gray-200">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{col.label}</p>
                    <p className="text-[10px] uppercase tracking-wider text-gray-400">
                      {col.stages.map((s) => STAGE_LABEL[s]).join(" · ")}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-white text-gray-600 rounded-full border border-gray-200">
                    {dealsInCol.length}
                  </span>
                </div>
                <div className="px-2 py-2 space-y-2 flex-1">
                  {dealsInCol.length === 0 ? (
                    <p className="text-xs text-gray-400 italic px-2 py-3">
                      No deals here yet.
                    </p>
                  ) : (
                    dealsInCol.map((d) => <DealCardView key={d.id} deal={d} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DealCardView({ deal }: { deal: DealCard }) {
  const score = deal.analystScore ?? deal.aiScore;
  const askLakhs =
    deal.fundingAsk == null ? null : Number(deal.fundingAsk / BigInt(10_000_000));

  return (
    <Link
      href={`/deals/${deal.id}`}
      className="block bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {deal.startupName}
        </p>
        {score != null && (
          <span
            className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded",
              score >= 80
                ? "bg-green-100 text-green-700"
                : score >= 60
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700",
            )}
          >
            {score}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500">{deal.verticalName}</p>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
        {askLakhs != null && (
          <span>₹{askLakhs}L</span>
        )}
        <span>Docs {deal.docCompleteness}%</span>
        <span>{deal.daysInStage}d</span>
      </div>
    </Link>
  );
}
