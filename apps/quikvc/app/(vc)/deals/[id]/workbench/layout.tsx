/**
 * Analyst Workbench layout — 3-pane shell from UX blueprint W6.
 *
 * Left rail: tab navigation (Overview / Scorecard / Risks / Comparables / Memo / Activity)
 * Center:    primary content area (children render here based on tab)
 * Right:     intelligence panel — AI insights, evidence, quick actions
 *            (Sprint 3a: minimal scaffold; Sprint 3b adds live AI panels)
 *
 * Sticky header with stage chip + score band sits above all three panes.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { STAGE_LABEL, type StageId } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "scorecard",   label: "Scorecard" },
  { slug: "risks",       label: "Risks" },
  { slug: "comparables", label: "Comparables" },
  { slug: "meetings",    label: "Meetings" },
  { slug: "memo",        label: "Memo" },
];

export default async function WorkbenchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) notFound();

  const deal = await db.vCDeal.findFirst({
    where: { id: params.id, tenantId },
    select: {
      id: true, currentStage: true, aiScore: true, analystScore: true,
      docCompleteness: true,
      vertical: { select: { name: true } },
      application: { select: { startupName: true } },
    },
  });
  if (!deal) notFound();

  const score = deal.analystScore ?? deal.aiScore;

  // Right panel data — small queries, run in parallel
  const [openSignals, openQuestions, recentEvents, latestMemo] = await Promise.all([
    db.vCDealSignal.findMany({
      where: { tenantId, dealId: deal.id, status: { not: "resolved" } },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      select: { id: true, severity: true, title: true },
      take: 5,
    }),
    db.vCDealQuestion.count({
      where: { tenantId, dealId: deal.id, status: "open" },
    }),
    db.vCTimelineEvent.findMany({
      where: { tenantId, dealId: deal.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, summary: true, createdAt: true },
      take: 5,
    }),
    db.vCICMemo.findUnique({
      where: { dealId: deal.id },
      select: { status: true, currentVersion: { select: { version: true } } },
    }),
  ]);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Sticky workbench header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/deals/${deal.id}`}
            className="text-xs text-gray-500 hover:text-gray-900 whitespace-nowrap"
          >
            ← Back
          </Link>
          <span className="text-gray-300">·</span>
          <h1 className="text-base font-semibold text-gray-900 truncate">
            {deal.application.startupName}
          </h1>
          <span className="text-xs text-gray-500 hidden md:inline">
            {deal.vertical.name}
          </span>
          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
            {STAGE_LABEL[deal.currentStage as StageId]}
          </span>
          {score != null && (
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
          )}
        </div>
      </header>

      {/* 3-pane body */}
      <div className="flex-1 flex min-h-0">
        {/* Left rail — tab nav */}
        <nav className="w-44 bg-gray-50 border-r border-gray-200 py-2 flex-shrink-0 overflow-y-auto">
          {TABS.map((t) => (
            <Link
              key={t.slug}
              href={`/deals/${deal.id}/workbench/${t.slug}`}
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-white"
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {/* Center — main work area */}
        <main className="flex-1 overflow-y-auto bg-white">{children}</main>

        {/* Right intelligence panel */}
        <aside className="w-80 bg-gray-50 border-l border-gray-200 px-4 py-4 flex-shrink-0 overflow-y-auto hidden xl:block space-y-5">
          {/* Top blockers */}
          <section>
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">
              Open blockers
            </p>
            {openSignals.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No open signals.</p>
            ) : (
              <ul className="space-y-1.5">
                {openSignals.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      "text-xs px-2 py-1.5 rounded border",
                      s.severity === "red"
                        ? "bg-red-50 text-red-800 border-red-200"
                        : s.severity === "amber"
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-green-50 text-green-800 border-green-200",
                    )}
                  >
                    <span className="text-[10px] uppercase tracking-wider mr-1">
                      {s.severity}
                    </span>
                    {s.title}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Quick stats */}
          <section className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white border border-gray-200 rounded-lg p-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">
                Open Q&amp;A
              </p>
              <p className="text-lg font-semibold tabular-nums text-gray-900">
                {openQuestions}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">
                Docs complete
              </p>
              <p className="text-lg font-semibold tabular-nums text-gray-900">
                {deal.docCompleteness}%
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-2 col-span-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">
                IC memo
              </p>
              <p className="text-sm text-gray-900 mt-0.5">
                {latestMemo
                  ? `${latestMemo.status} · v${latestMemo.currentVersion?.version ?? "?"}`
                  : "Not started"}
              </p>
            </div>
          </section>

          {/* Recent activity */}
          <section>
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">
              Recent activity
            </p>
            {recentEvents.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No activity yet.</p>
            ) : (
              <ul className="space-y-2">
                {recentEvents.map((e) => (
                  <li
                    key={e.id}
                    className="text-xs border-l-2 border-blue-200 pl-2"
                  >
                    <p className="text-gray-700 leading-snug">{e.summary}</p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(e.createdAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
