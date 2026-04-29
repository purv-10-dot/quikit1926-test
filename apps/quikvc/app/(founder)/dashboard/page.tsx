/**
 * Founder Dashboard — real data version.
 *
 * Pulls the founder's own application + linked deal, derives:
 *   - Current stage (founder-friendly label) + progress bar
 *   - Pending actions: missing docs (status=missing), open Q&A awaiting answer
 *   - Activity timeline: VCTimelineEvent rows with visibility "founder"
 *
 * Founders only see THEIR OWN data — query is scoped by tenantId AND
 * founderId. There's no "see all applications" path here; if a founder
 * has multiple applications they only see the most recent (rare in v1).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/require-session";
import {
  STAGE_ORDER,
  FOUNDER_STAGE_LABEL,
  type StageId,
} from "@/lib/pipeline";
import { cn } from "@/lib/utils";

export default async function FounderDashboardPage() {
  const { userId, tenantId } = await requireSession();
  if (!tenantId || !userId) notFound();

  // Most recent application by this founder
  const application = await db.vCApplication.findFirst({
    where: { tenantId, founderId: userId },
    include: {
      deal: {
        select: {
          id: true,
          currentStage: true,
          closedStatus: true,
          docCompleteness: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // No application yet — show the empty state with the Start button
  if (!application) {
    return (
      <div className="px-4 py-5 max-w-3xl mx-auto space-y-5">
        <header>
          <h1 className="text-xl font-semibold text-gray-900">Welcome</h1>
          <p className="text-sm text-gray-500 mt-1">
            Start your funding application to begin the review process.
          </p>
        </header>

        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-gray-400">Status</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">Application not started</p>
          <p className="text-sm text-gray-500 mt-1">
            The wizard takes 5–10 minutes. You can save and resume later.
          </p>
          <Link
            href="/application/new"
            className="inline-block mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Start application
          </Link>
        </section>
      </div>
    );
  }

  // Has application — pull pending actions + timeline in parallel
  const dealId = application.deal?.id ?? null;

  const [missingDocs, openQuestions, recentEvents] = await Promise.all([
    dealId
      ? db.vCDealDocument.findMany({
          where: { tenantId, dealId, status: "missing" },
          select: { id: true, category: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([] as { id: string; category: string }[]),
    dealId
      ? db.vCDealQuestion.findMany({
          where: { tenantId, dealId, status: "open" },
          select: { id: true, question: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : Promise.resolve([] as { id: string; question: string; createdAt: Date }[]),
    dealId
      ? db.vCTimelineEvent.findMany({
          where: { tenantId, dealId, visibility: { in: ["founder", "investor"] } },
          select: { id: true, type: true, summary: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve(
          [] as { id: string; type: string; summary: string; createdAt: Date }[],
        ),
  ]);

  const stage = (application.deal?.currentStage ?? "intake") as StageId;
  const currentIdx = STAGE_ORDER.indexOf(stage);
  const totalStages = STAGE_ORDER.length;
  const progressPct = Math.round(((currentIdx + 1) / totalStages) * 100);

  const closed = application.deal?.closedStatus !== "open";
  const isWon = application.deal?.closedStatus === "closed-won";

  return (
    <div className="px-4 py-5 max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">{application.startupName}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track your application status, upload pending documents, and reply to
          questions from the VC team.
        </p>
      </header>

      {/* Current stage + progress */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-wider text-gray-400">Current stage</p>
          <p className="text-xs text-gray-500 tabular-nums">
            {currentIdx + 1} of {totalStages}
          </p>
        </div>
        <p
          className={cn(
            "text-lg font-semibold mt-1",
            isWon
              ? "text-green-700"
              : closed
                ? "text-gray-500"
                : "text-gray-900",
          )}
        >
          {closed
            ? isWon
              ? "Approved 🎉"
              : "Closed"
            : FOUNDER_STAGE_LABEL[stage]}
        </p>
        <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
              isWon ? "bg-green-500" : closed ? "bg-gray-400" : "bg-blue-500",
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {application.deal?.docCompleteness != null && (
          <p className="text-xs text-gray-500 mt-2">
            Documents: <strong className="text-gray-700">{application.deal.docCompleteness}%</strong>{" "}
            complete
          </p>
        )}
      </section>

      {/* Pending actions */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-900">Pending actions</p>
        {missingDocs.length === 0 && openQuestions.length === 0 ? (
          <p className="text-xs text-gray-400 italic mt-3">
            Nothing pending. The VC team will notify you here when they need
            something.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {missingDocs.map((d) => (
              <li
                key={d.id}
                className="flex items-start justify-between gap-3 text-sm border border-gray-100 rounded-lg px-3 py-2"
              >
                <span className="text-gray-700">
                  Upload <strong>{d.category}</strong>
                </span>
                <Link
                  href="/documents"
                  className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                >
                  Upload →
                </Link>
              </li>
            ))}
            {openQuestions.map((q) => (
              <li
                key={q.id}
                className="flex items-start justify-between gap-3 text-sm border border-gray-100 rounded-lg px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-gray-700 truncate">{q.question}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Asked {new Date(q.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </p>
                </div>
                <Link
                  href="/questions"
                  className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                >
                  Reply →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Activity timeline */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-900">Activity timeline</p>
        {recentEvents.length === 0 ? (
          <p className="text-xs text-gray-400 italic mt-3">No activity yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {recentEvents.map((e) => (
              <li key={e.id} className="border-l-2 border-blue-200 pl-3">
                <p className="text-sm text-gray-800">{e.summary}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
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
    </div>
  );
}
