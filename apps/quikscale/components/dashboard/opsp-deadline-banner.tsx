"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, ArrowRight, AlertTriangle } from "lucide-react";

/* ────────────── Payload types (mirror /api/opsp/deadline) ────────────── */

interface FinalizePayload {
  mode: "A" | "B";
  show: true;
  daysLeft: number;
  message: string;
  period: string;
  // Mode A extras (optional)
  createdAt?: string;
  autoFinalizeDate?: string;
  thresholdDays?: number;
  opspStatus?: string;
}

interface ReviewPayload {
  show: true;
  daysUntilQuarterEnd: number;
  isOverdue: boolean;
  message: string;
  period: string;
}

interface AutoFinalizedNotice {
  message: string;
}

interface DeadlineResponse {
  success: boolean;
  finalize: FinalizePayload | null;
  review: ReviewPayload | null;
  autoFinalized?: { message: string };
}

/* ────────────── Color scheme ────────────── */

type ColorScheme = {
  bg: string;
  border: string;
  icon: string;
  title: string;
  desc: string;
  pill: string;
  btn: string;
};

const RED: ColorScheme = {
  bg: "bg-red-50",
  border: "border-red-200",
  icon: "text-red-500",
  title: "text-red-800",
  desc: "text-red-600",
  pill: "bg-red-100 text-red-700 border-red-200",
  btn: "bg-red-600 hover:bg-red-700 text-white",
};
const AMBER: ColorScheme = {
  bg: "bg-amber-50",
  border: "border-amber-200",
  icon: "text-amber-500",
  title: "text-amber-800",
  desc: "text-amber-600",
  pill: "bg-amber-100 text-amber-700 border-amber-200",
  btn: "bg-amber-600 hover:bg-amber-700 text-white",
};
const BLUE: ColorScheme = {
  bg: "bg-blue-50",
  border: "border-blue-200",
  icon: "text-blue-500",
  title: "text-blue-800",
  desc: "text-blue-600",
  pill: "bg-blue-100 text-blue-700 border-blue-200",
  btn: "bg-blue-600 hover:bg-blue-700 text-white",
};

/** Urgency color ramp: ≤3 days = red, ≤7 = amber, else blue. */
function urgencyColors(daysLeft: number): ColorScheme {
  if (daysLeft <= 3) return RED;
  if (daysLeft <= 7) return AMBER;
  return BLUE;
}

/* ────────────── Main banner ────────────── */

/**
 * Global OPSP banner host — appears on every dashboard page.
 *
 * Renders up to two stacked sub-banners:
 *   1. Finalize warning (Mode A or Mode B) — driven by `opsp_threshold_days`
 *   2. Review reminder — driven by `opsp_review_threshold_days`
 *
 * If `/api/opsp/deadline` lazy auto-finalizes (Mode A only), both sub-banners
 * are replaced by a short-lived green confirmation that auto-dismisses.
 *
 * Listens for two window events that the OPSP page dispatches after the user
 * finalizes or submits the review, so the banner clears instantly without
 * waiting for a re-fetch:
 *   - `opsp-finalized` → clear the Finalize banner
 *   - `opsp-review-submitted`  → clear the Review banner
 */
export function OPSPDeadlineBanner() {
  const router = useRouter();
  const [data, setData] = useState<DeadlineResponse | null>(null);
  const [autoFinalized, setAutoFinalized] = useState<AutoFinalizedNotice | null>(null);

  // Instant dismissal on local user action.
  useEffect(() => {
    const onFinalized = () =>
      setData((prev) => (prev ? { ...prev, finalize: null } : prev));
    const onReviewed = () =>
      setData((prev) => (prev ? { ...prev, review: null } : prev));
    window.addEventListener("opsp-finalized", onFinalized);
    window.addEventListener("opsp-review-submitted", onReviewed);
    return () => {
      window.removeEventListener("opsp-finalized", onFinalized);
      window.removeEventListener("opsp-review-submitted", onReviewed);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/opsp/deadline");
        if (!res.ok) return;
        const json: DeadlineResponse = await res.json();
        if (!mounted) return;

        if (json.success && json.autoFinalized) {
          setAutoFinalized(json.autoFinalized);
          // Auto-dismiss the green notice after 8 seconds.
          setTimeout(() => {
            if (mounted) setAutoFinalized(null);
          }, 8000);
          return;
        }
        if (json.success) {
          setData(json);
        }
      } catch {
        // silent — banner is non-critical
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (autoFinalized) {
    return <AutoFinalizedNoticeBar message={autoFinalized.message} onView={() => router.push("/opsp")} />;
  }

  const finalize = data?.finalize ?? null;
  const review = data?.review ?? null;
  if (!finalize && !review) return null;

  return (
    <>
      {finalize && <FinalizeSubBanner data={finalize} onClick={() => router.push("/opsp")} />}
      {review && <ReviewSubBanner data={review} onClick={() => router.push("/opsp/review")} />}
    </>
  );
}

/* ────────────── Sub-banners ────────────── */

function AutoFinalizedNoticeBar({ message, onView }: { message: string; onView: () => void }) {
  return (
    <div className="bg-green-50 border-b border-green-200 px-4 py-2.5">
      <div className="flex items-center justify-between gap-3 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 p-1.5 rounded-lg bg-green-50">
            <Clock className="h-4 w-4 text-green-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-green-800 leading-tight">
              OPSP Auto-Finalized
            </p>
            <p className="text-[11px] text-green-600 leading-tight mt-0.5">
              {message} All data is now locked.
            </p>
          </div>
        </div>
        <button
          onClick={onView}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors bg-green-600 hover:bg-green-700 text-white flex-shrink-0"
        >
          View OPSP
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function FinalizeSubBanner({
  data,
  onClick,
}: {
  data: FinalizePayload;
  onClick: () => void;
}) {
  const { mode, daysLeft, message, period } = data;
  // Mode B overdue (negative daysLeft) forces red regardless of magnitude.
  const colors = daysLeft < 0 ? RED : urgencyColors(daysLeft);

  // Mode A keeps the original short, prescriptive title for visual continuity.
  // Mode B uses the server-built sentence (which already includes the period
  // and the "overdue" wording when applicable).
  let title: string;
  if (mode === "A") {
    const daysText =
      daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
    title = `Your OPSP (${period}) will be auto-finalized ${daysText}`;
  } else {
    title = message;
  }

  const pillText =
    daysLeft < 0
      ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} overdue`
      : daysLeft === 0
        ? "Due today"
        : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;

  return (
    <div className={`${colors.bg} border-b ${colors.border} px-4 py-2.5`}>
      <div className="flex items-center justify-between gap-3 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex-shrink-0 p-1.5 rounded-lg ${colors.bg}`}>
            {daysLeft < 0 ? (
              <AlertTriangle className={`h-4 w-4 ${colors.icon}`} />
            ) : (
              <Clock className={`h-4 w-4 ${colors.icon}`} />
            )}
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-semibold ${colors.title} leading-tight`}>{title}</p>
            <p className={`text-[11px] ${colors.desc} leading-tight mt-0.5`}>
              {mode === "A"
                ? "Complete and review your One-Page Strategic Plan before the deadline."
                : "Quarter closes soon — finalize to lock the plan."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${colors.pill}`}
          >
            {pillText}
          </span>
          <button
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${colors.btn}`}
          >
            Complete OPSP
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewSubBanner({
  data,
  onClick,
}: {
  data: ReviewPayload;
  onClick: () => void;
}) {
  const { daysUntilQuarterEnd, isOverdue, message } = data;
  // Overdue always renders red; otherwise use the urgency ramp on the
  // positive remaining-days value.
  const colors = isOverdue ? RED : urgencyColors(daysUntilQuarterEnd);

  const pillText = isOverdue
    ? `${Math.abs(daysUntilQuarterEnd)} day${Math.abs(daysUntilQuarterEnd) === 1 ? "" : "s"} overdue`
    : daysUntilQuarterEnd === 0
      ? "Due today"
      : `${daysUntilQuarterEnd} day${daysUntilQuarterEnd === 1 ? "" : "s"} left`;

  return (
    <div className={`${colors.bg} border-b ${colors.border} px-4 py-2.5`}>
      <div className="flex items-center justify-between gap-3 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex-shrink-0 p-1.5 rounded-lg ${colors.bg}`}>
            {isOverdue ? (
              <AlertTriangle className={`h-4 w-4 ${colors.icon}`} />
            ) : (
              <Clock className={`h-4 w-4 ${colors.icon}`} />
            )}
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-semibold ${colors.title} leading-tight`}>{message}</p>
            <p className={`text-[11px] ${colors.desc} leading-tight mt-0.5`}>
              Submit your OPSP review so the next quarter can pick up the actuals.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${colors.pill}`}
          >
            {pillText}
          </span>
          <button
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${colors.btn}`}
          >
            Review OPSP
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
