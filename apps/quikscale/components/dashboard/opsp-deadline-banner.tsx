"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, ArrowRight } from "lucide-react";

interface DeadlineData {
  show: boolean;
  daysLeft: number;
  thresholdDays: number;
  opspStatus: string;
}

interface AutoFinalizedNotice {
  autoFinalized: true;
  message: string;
}

/**
 * Global OPSP deadline banner — appears on every dashboard page
 * when the user's current-quarter OPSP is still in draft and
 * the auto-finalize threshold window has been reached.
 *
 * If the deadline has already passed, the API auto-finalizes the OPSP
 * (lazy evaluation) and returns `{ autoFinalized: true }`. In that case,
 * we show a brief notification that the OPSP was locked automatically.
 */
export function OPSPDeadlineBanner() {
  const router = useRouter();
  const [data, setData] = useState<DeadlineData | null>(null);
  const [autoFinalized, setAutoFinalized] = useState<AutoFinalizedNotice | null>(null);

  // Hide banner instantly when OPSP is finalized from the OPSP page
  useEffect(() => {
    const handler = () => setData(null);
    window.addEventListener("opsp-finalized", handler);
    return () => window.removeEventListener("opsp-finalized", handler);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/opsp/deadline");
        if (!res.ok) return;
        const json = await res.json();
        if (!mounted) return;

        if (json.success && json.autoFinalized) {
          setAutoFinalized({ autoFinalized: true, message: json.message });
          // Auto-dismiss after 8 seconds
          setTimeout(() => { if (mounted) setAutoFinalized(null); }, 8000);
        } else if (json.success && json.show) {
          setData(json);
        }
      } catch {
        // silent — banner is non-critical
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Auto-finalized notification — green banner that auto-dismisses
  if (autoFinalized) {
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
                Your OPSP deadline has passed and it has been automatically finalized. All data is now locked.
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push("/opsp")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors bg-green-600 hover:bg-green-700 text-white flex-shrink-0"
          >
            View OPSP
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  if (!data?.show) return null;

  const { daysLeft } = data;
  const isUrgent = daysLeft <= 3;
  const isWarning = daysLeft <= 7 && !isUrgent;

  // Color scheme based on urgency
  const colors = isUrgent
    ? {
        bg: "bg-red-50",
        border: "border-red-200",
        icon: "text-red-500",
        title: "text-red-800",
        desc: "text-red-600",
        pill: "bg-red-100 text-red-700 border-red-200",
        btn: "bg-red-600 hover:bg-red-700 text-white",
      }
    : isWarning
      ? {
          bg: "bg-amber-50",
          border: "border-amber-200",
          icon: "text-amber-500",
          title: "text-amber-800",
          desc: "text-amber-600",
          pill: "bg-amber-100 text-amber-700 border-amber-200",
          btn: "bg-amber-600 hover:bg-amber-700 text-white",
        }
      : {
          bg: "bg-blue-50",
          border: "border-blue-200",
          icon: "text-blue-500",
          title: "text-blue-800",
          desc: "text-blue-600",
          pill: "bg-blue-100 text-blue-700 border-blue-200",
          btn: "bg-blue-600 hover:bg-blue-700 text-white",
        };

  const daysText = daysLeft === 0
    ? "today"
    : daysLeft === 1
      ? "tomorrow"
      : `in ${daysLeft} days`;

  return (
    <div className={`${colors.bg} border-b ${colors.border} px-4 py-2.5`}>
      <div className="flex items-center justify-between gap-3 max-w-screen-2xl mx-auto">
        {/* Left — icon + message */}
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex-shrink-0 p-1.5 rounded-lg ${colors.bg}`}>
            <Clock className={`h-4 w-4 ${colors.icon}`} />
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-semibold ${colors.title} leading-tight`}>
              Your OPSP will be auto-finalized {daysText}
            </p>
            <p className={`text-[11px] ${colors.desc} leading-tight mt-0.5`}>
              Complete and review your One-Page Strategic Plan before the deadline.
            </p>
          </div>
        </div>

        {/* Right — days pill + CTA */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${colors.pill}`}>
            {daysLeft === 0 ? "Due today" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`}
          </span>
          <button
            onClick={() => router.push("/opsp")}
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
