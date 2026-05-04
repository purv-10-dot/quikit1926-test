/**
 * Partner Review — summary-first deal review with go/no-go decision.
 *
 * UX W13: header + center brief + sticky decision panel. Partner picks
 * one of: approve to IC / ask more data / reject with reason / return to
 * analyst. Each routes the deal differently.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import PartnerDecisionPanel from "./partner-decision-panel";
import { cn } from "@/lib/utils";
import { getVCRole, PARTNER_ROLES } from "@/lib/rbac";

export default async function PartnerReviewPage({ params }: { params: { id: string } }) {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  const userId = session?.user?.id;
  if (!orgId || !userId) notFound();

  const viewerRole = await getVCRole(userId, orgId);
  const canDecide = viewerRole !== null && PARTNER_ROLES.includes(viewerRole);

  const deal = await db.vCDeal.findFirst({
    where: { id: params.id, orgId },
    include: {
      application: { select: { startupName: true, description: true, fundingAsk: true, loanType: true } },
      vertical: { select: { name: true } },
      signals: {
        where: { status: { not: "resolved" } },
        select: { id: true, severity: true, title: true, description: true },
        orderBy: { severity: "asc" },
      },
      icMemos: {
        select: {
          status: true,
          currentVersion: { select: { version: true } },
        },
      },
    },
  });
  if (!deal) notFound();

  const score = deal.analystScore ?? deal.aiScore;
  const askLakhs = deal.application.fundingAsk
    ? Number(deal.application.fundingAsk / BigInt(10_000_000))
    : 0;
  const memo = deal.icMemos[0];

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      <Link href={`/deals/${deal.id}`} className="text-xs text-gray-500 hover:text-gray-900 mb-2 inline-block">
        ← Back to deal
      </Link>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-gray-900">Partner Review</h1>
        <p className="text-sm text-gray-500 mt-1">
          Summary-first read. Decide whether to approve to IC, request more data, or reject.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Center: brief */}
        <div className="lg:col-span-2 space-y-4">
          {/* Hero card */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {deal.application.startupName}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {deal.vertical.name} · ₹{askLakhs.toLocaleString("en-IN")}L · {deal.application.loanType ?? "—"}
                </p>
              </div>
              {score != null && (
                <div
                  className={cn(
                    "text-3xl font-bold tabular-nums",
                    score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-600" : "text-red-600",
                  )}
                >
                  {score}
                </div>
              )}
            </div>
          </section>

          {/* Description */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Why this matters</p>
            <p className="text-sm text-gray-800">{deal.application.description ?? "—"}</p>
          </section>

          {/* Top risks */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Top risks</p>
            {deal.signals.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No open risks logged.</p>
            ) : (
              <ul className="space-y-2">
                {deal.signals.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-sm">
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border whitespace-nowrap",
                        s.severity === "red"
                          ? "bg-red-100 text-red-700 border-red-200"
                          : s.severity === "amber"
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-green-100 text-green-700 border-green-200",
                      )}
                    >
                      {s.severity}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">{s.title}</p>
                      {s.description && <p className="text-xs text-gray-600 mt-0.5">{s.description}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right: decision panel — partners only */}
        {canDecide ? (
          <PartnerDecisionPanel
            dealId={deal.id}
            currentStage={deal.currentStage}
            memoStatus={memo?.status ?? null}
            memoVersion={memo?.currentVersion?.version ?? null}
          />
        ) : (
          <aside className="space-y-3">
            <div className="bg-white border border-gray-200 rounded-xl p-4 sticky top-4 space-y-2">
              <p className="text-xs uppercase tracking-wider text-gray-400">Decision</p>
              <p className="text-xs text-gray-600">
                Read-only view. Partner sign-off is required to advance this deal — your role
                ({viewerRole ?? "none"}) cannot approve to IC.
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
