/**
 * Risks tab — risk register with severity heat strip.
 *
 * Sprint 3a: list + manual add. Sprint 3b: auto-detect from financials,
 * compliance, transcript analysis (writes VCDealSignal rows automatically).
 */
import { notFound } from "next/navigation";
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import RiskAddButton from "./risk-add-button";
import { cn } from "@/lib/utils";

const SEVERITY_BADGE: Record<string, string> = {
  red:   "bg-red-100 text-red-700 border-red-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  green: "bg-green-100 text-green-700 border-green-200",
};

export default async function RisksPage({ params }: { params: { id: string } }) {
  const session = await getDevAwareSession();
  const orgId = session?.user?.orgId;
  if (!orgId) notFound();

  const signals = await db.vCDealSignal.findMany({
    where: { orgId, dealId: params.id },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      severity: true,
      title: true,
      description: true,
      mitigation: true,
      source: true,
      status: true,
      createdAt: true,
    },
  });

  const counts = {
    red: signals.filter((s) => s.severity === "red" && s.status !== "resolved").length,
    amber: signals.filter((s) => s.severity === "amber" && s.status !== "resolved").length,
    green: signals.filter((s) => s.severity === "green").length,
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Risk Register</h2>
          <p className="text-sm text-gray-500 mt-1">
            Open risks against this deal. Auto-detection adds entries from
            financials + transcripts in Sprint 3b.
          </p>
        </div>
        <RiskAddButton dealId={params.id} />
      </header>

      {/* Heat strip */}
      <section className="grid grid-cols-3 gap-3">
        {(["red", "amber", "green"] as const).map((s) => (
          <div
            key={s}
            className={cn(
              "rounded-xl px-4 py-3 border",
              s === "red" ? "bg-red-50 border-red-200" : s === "amber" ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200",
            )}
          >
            <p className="text-xs uppercase tracking-wider text-gray-600">{s} signals</p>
            <p className={cn(
              "text-2xl font-semibold mt-1 tabular-nums",
              s === "red" ? "text-red-700" : s === "amber" ? "text-amber-700" : "text-green-700",
            )}>
              {counts[s]}
            </p>
          </div>
        ))}
      </section>

      {/* List */}
      {signals.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">No risks logged yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Click &ldquo;Add risk&rdquo; above, or paste a meeting transcript on the
            Meetings tab to auto-detect risks via Claude.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {signals.map((s) => (
            <li key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                </div>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border",
                    SEVERITY_BADGE[s.severity] ?? "bg-gray-100 text-gray-600 border-gray-200",
                  )}
                >
                  {s.severity}
                </span>
              </div>
              {s.description && (
                <p className="text-xs text-gray-600 mt-1">{s.description}</p>
              )}
              {s.mitigation && (
                <p className="text-xs text-gray-500 mt-2 bg-gray-50 px-2 py-1 rounded">
                  <strong>Mitigation:</strong> {s.mitigation}
                </p>
              )}
              <p className="text-[10px] text-gray-400 mt-2">
                Source: {s.source} · Status: {s.status} · {new Date(s.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
