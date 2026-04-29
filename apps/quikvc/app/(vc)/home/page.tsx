/**
 * VC Home / Command Center — real data version.
 *
 * KPI strip:
 *   - Active deals      = count of open deals
 *   - Avg AI score      = avg aiScore across open deals (whole numbers)
 *   - IC due 48h        = count of frozen memos awaiting settle + IC meetings within 48h
 *   - Capital deployed  = sum of allocated amounts (lakhs)
 *
 * Two-column body:
 *   - Actionable queue = deals with attention triggers (red signals, missing docs,
 *                        open Q&A, frozen memo without vote, stale stage > 7 days)
 *   - Upcoming meetings = next 5 scheduled meetings across all deals
 *   - AI daily brief    = latest "ai-daily-summary" timeline event for this tenant
 */
import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/require-session";
import { STAGE_LABEL, type StageId } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

export default async function VCHomePage() {
  const { tenantId } = await requireSession();

  const since48h = new Date(Date.now() + 48 * 3600_000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000);

  // KPI queries in parallel
  const [
    openDealCount,
    avgScoreAgg,
    icDueMemos,
    icMeetingsCount,
    allocSum,
    actionableDeals,
    upcomingMeetings,
    dailyBrief,
  ] = await Promise.all([
    db.vCDeal.count({ where: { tenantId, closedStatus: "open" } }),

    db.vCDeal.aggregate({
      where: { tenantId, closedStatus: "open", aiScore: { not: null } },
      _avg: { aiScore: true },
    }),

    // Frozen memos that haven't been settled (still in ic-review stage)
    db.vCICMemo.count({
      where: {
        tenantId,
        status: "frozen",
        deal: { currentStage: "ic-review" },
      },
    }),

    db.vCMeeting.count({
      where: {
        tenantId,
        type: "ic-review",
        status: "scheduled",
        scheduledAt: { lte: since48h, gte: new Date() },
      },
    }),

    db.vCDealAllocation.aggregate({
      where: { tenantId },
      _sum: { amount: true },
    }),

    // Actionable: deals with at least one of [open red signal, missing doc, open Q&A,
    // sitting in ic-review with frozen memo, > 7 days since update].
    db.vCDeal.findMany({
      where: {
        tenantId,
        closedStatus: "open",
        OR: [
          { signals: { some: { severity: "red", status: { not: "resolved" } } } },
          { documents: { some: { status: "missing" } } },
          { questions: { some: { status: "open" } } },
          {
            currentStage: "ic-review",
            icMemos: { some: { status: "frozen" } },
          },
          { updatedAt: { lt: sevenDaysAgo } },
        ],
      },
      include: {
        application: { select: { startupName: true } },
        _count: {
          select: {
            signals: { where: { severity: "red", status: { not: "resolved" } } },
            documents: { where: { status: "missing" } },
            questions: { where: { status: "open" } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),

    db.vCMeeting.findMany({
      where: {
        tenantId,
        status: "scheduled",
        scheduledAt: { gte: new Date() },
      },
      include: {
        deal: {
          select: { id: true, application: { select: { startupName: true } } },
        },
      },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),

    db.vCTimelineEvent.findFirst({
      where: { tenantId, type: "ai-daily-summary" },
      orderBy: { createdAt: "desc" },
      select: { summary: true, createdAt: true },
    }),
  ]);

  const totalCapitalLakhs = Number((allocSum._sum.amount ?? BigInt(0)) / BigInt(10_000_000));
  const avgScore = avgScoreAgg._avg.aiScore != null ? Math.round(avgScoreAgg._avg.aiScore) : null;
  const icDueCount = icDueMemos + icMeetingsCount;

  const kpis = [
    { label: "Active deals",      value: openDealCount > 0 ? String(openDealCount) : "0", sub: "Open across all stages",          tone: "neutral" as const },
    { label: "Avg AI score",      value: avgScore != null ? String(avgScore) : "—",        sub: "Across deals with AI scoring",     tone: avgScore != null && avgScore >= 75 ? "success" as const : "neutral" as const },
    { label: "IC due 48h",        value: String(icDueCount),                               sub: "Frozen memos + scheduled IC mtgs", tone: icDueCount > 0 ? "warning" as const : "neutral" as const },
    { label: "Capital deployed",  value: `₹${totalCapitalLakhs.toLocaleString("en-IN")}L`,  sub: "Allocated to date",                tone: "neutral" as const },
  ];

  return (
    <div className="px-6 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Command Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          What needs your attention right now.
        </p>
      </header>

      {/* KPI strip */}
      <section
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        aria-label="Key performance indicators"
      >
        {kpis.map((card) => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500">{card.label}</p>
            <p
              className={cn(
                "text-2xl font-semibold mt-1 tabular-nums",
                card.tone === "success"
                  ? "text-green-600"
                  : card.tone === "warning"
                    ? "text-amber-600"
                    : "text-gray-900",
              )}
            >
              {card.value}
            </p>
            <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </section>

      {/* Two-column body */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Actionable queue */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Actionable queue</h2>
            <Link href="/deals" className="text-xs text-gray-500 hover:text-gray-900">
              View all →
            </Link>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Deals needing analyst action — red risks, missing docs, open Q&amp;A, or stale &gt; 7 days.
          </p>

          {actionableDeals.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400 italic">All clear. No deals need action.</p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-100">
              {actionableDeals.map((d) => {
                const triggers: string[] = [];
                if (d._count.signals > 0) triggers.push(`${d._count.signals} red`);
                if (d._count.documents > 0) triggers.push(`${d._count.documents} missing doc${d._count.documents > 1 ? "s" : ""}`);
                if (d._count.questions > 0) triggers.push(`${d._count.questions} open Q&A`);
                if (d.updatedAt < sevenDaysAgo) triggers.push("stale > 7d");
                return (
                  <li key={d.id} className="py-2.5">
                    <Link
                      href={`/deals/${d.id}`}
                      className="flex items-center justify-between gap-3 hover:bg-gray-50 rounded -mx-2 px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {d.application.startupName}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          <span className="text-gray-700">
                            {STAGE_LABEL[d.currentStage as StageId] ?? d.currentStage}
                          </span>
                          {triggers.length > 0 && (
                            <>
                              {" · "}
                              <span className="text-amber-700">{triggers.join(" · ")}</span>
                            </>
                          )}
                        </p>
                      </div>
                      {d.aiScore != null && (
                        <span
                          className={cn(
                            "text-xs font-medium tabular-nums px-2 py-0.5 rounded",
                            d.aiScore >= 80
                              ? "bg-green-100 text-green-700"
                              : d.aiScore >= 60
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700",
                          )}
                        >
                          {d.aiScore}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right sidecar: meetings + AI brief */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900">Upcoming meetings</h2>
            {upcomingMeetings.length === 0 ? (
              <p className="text-xs text-gray-400 italic mt-3">No meetings scheduled.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {upcomingMeetings.map((m) => (
                  <li key={m.id} className="text-xs">
                    <Link
                      href={`/deals/${m.deal.id}/workbench/meetings`}
                      className="block hover:bg-gray-50 rounded -mx-2 px-2 py-1"
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {m.deal.application.startupName}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {m.scheduledAt
                          ? new Date(m.scheduledAt).toLocaleString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Date TBD"}
                        {" · "}
                        {m.type.replace(/-/g, " ")}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900">AI daily brief</h2>
            {dailyBrief ? (
              <>
                <p className="text-xs text-gray-700 mt-3 leading-relaxed">{dailyBrief.summary}</p>
                <p className="text-[10px] text-gray-400 mt-2">
                  Generated{" "}
                  {new Date(dailyBrief.createdAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-400 italic mt-3">
                Today&apos;s brief hasn&apos;t generated yet. Cron runs hourly per tenant
                (matches <code className="font-mono">VCFundProfile.dailyBriefHour</code>).
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
