"use client";

/**
 * Cycle Hub — /performance/cycle
 *
 * R10b: the integration layer for the quarterly performance cycle. Reads
 * QuarterSetting + PerformanceReview + Goal state and computes the current
 * phase, then shows the user what to do next. Pure read, no new writes.
 */

import Link from "next/link";
import {
  Target, CheckCircle2, Clock, Users, BarChart2, ArrowRight,
  CalendarDays, AlertCircle,
} from "lucide-react";
import { useCycle } from "@/lib/hooks/usePerformance";

type Phase =
  | "quarter-kickoff"
  | "execution"
  | "self-assessment"
  | "manager-review"
  | "calibration"
  | "closed";

interface CycleData {
  phase: Phase;
  quarter: string | null;
  year: number | null;
  startDate: string | null;
  endDate: string | null;
  weekInQuarter: number | null;
  weeksRemaining: number | null;
  userReview: {
    id: string;
    status: string;
    rating: number | null;
    overallScore: number | null;
    updatedAt: string;
  } | null;
  goals: { active: number; total: number } | null;
  metrics: {
    orgReviewsPending: number;
    orgReviewsComplete: number;
    orgGoalsActive: number;
  } | null;
  message?: string;
}

const PHASE_CONFIG: Record<
  Phase,
  { label: string; description: string; accent: string; action: { label: string; href: string } | null }
> = {
  "quarter-kickoff": {
    label: "Quarter Kick-off",
    description:
      "Set your quarterly goals and commit to your priorities. The first two weeks of the quarter are for planning.",
    accent: "from-accent-50 to-white border-accent-200",
    action: { label: "Set goals", href: "/performance/goals" },
  },
  execution: {
    label: "Execution",
    description:
      "Track weekly KPIs, update priority status, run your meeting rhythm, and hold 1:1s.",
    accent: "from-blue-50 to-white border-blue-200",
    action: { label: "Review KPIs", href: "/kpi" },
  },
  "self-assessment": {
    label: "Self-Assessment",
    description:
      "The quarter is wrapping up. Write your self-assessment before your manager starts their review.",
    accent: "from-purple-50 to-white border-purple-200",
    action: { label: "Start self-review", href: "/performance/self" },
  },
  "manager-review": {
    label: "Manager Review",
    description:
      "Your self-assessment is in. Your manager is writing their review. Expect a conversation this week.",
    accent: "from-amber-50 to-white border-amber-200",
    action: { label: "View reviews", href: "/performance/reviews" },
  },
  calibration: {
    label: "Calibration",
    description:
      "Admins are normalizing ratings across the team. Reviews will be locked shortly.",
    accent: "from-gray-50 to-white border-gray-200",
    action: { label: "View reviews", href: "/performance/reviews" },
  },
  closed: {
    label: "Between Quarters",
    description:
      "No active quarter. Initialize Quarter Settings to start a new cycle.",
    accent: "from-gray-50 to-white border-gray-200",
    action: { label: "Quarter settings", href: "/org-setup/quarters" },
  },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CycleHubPage() {
  const { data, isLoading, error } = useCycle();
  const cycle = data as CycleData | undefined;

  if (isLoading) {
    return <div className="p-8 text-sm text-gray-400">Loading cycle…</div>;
  }
  if (error) {
    return (
      <div className="p-8 text-sm text-red-600">
        Error: {(error as Error).message}
      </div>
    );
  }
  if (!cycle) return null;

  const phaseCfg = PHASE_CONFIG[cycle.phase];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-base font-semibold text-gray-900">Performance Cycle</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Where you are in the current quarterly cycle, and what to do next.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Current phase card */}
          <div
            className={`bg-gradient-to-br ${phaseCfg.accent} border rounded-xl p-6`}
          >
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    Current phase
                  </span>
                  {cycle.quarter && cycle.year && (
                    <span className="text-[10px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded font-medium">
                      {cycle.quarter} · {cycle.year}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                  {phaseCfg.label}
                </h2>
                <p className="text-sm text-gray-600 mb-4">{phaseCfg.description}</p>
                {phaseCfg.action && (
                  <Link
                    href={phaseCfg.action.href}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {phaseCfg.action.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
                {cycle.message && (
                  <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <p>{cycle.message}</p>
                  </div>
                )}
              </div>
              {cycle.weekInQuarter !== null && cycle.weeksRemaining !== null && (
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    Week
                  </div>
                  <div className="text-3xl font-bold text-gray-900">
                    {cycle.weekInQuarter}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {cycle.weeksRemaining} week
                    {cycle.weeksRemaining === 1 ? "" : "s"} remaining
                  </div>
                  {cycle.startDate && cycle.endDate && (
                    <div className="text-[10px] text-gray-400 mt-1">
                      {fmtDate(cycle.startDate)} – {fmtDate(cycle.endDate)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Three context cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ContextCard
              icon={Target}
              label="Your goals"
              value={cycle.goals ? `${cycle.goals.active} active` : "—"}
              sub={cycle.goals ? `${cycle.goals.total} total this quarter` : ""}
              href="/performance/goals"
            />
            <ContextCard
              icon={CheckCircle2}
              label="Your review"
              value={
                cycle.userReview
                  ? formatReviewStatus(cycle.userReview.status)
                  : "Not started"
              }
              sub={
                cycle.userReview
                  ? `Updated ${new Date(cycle.userReview.updatedAt).toLocaleDateString()}`
                  : "Self-assessment opens in week 12"
              }
              href="/performance/self"
            />
            <ContextCard
              icon={Users}
              label="Org reviews"
              value={
                cycle.metrics
                  ? `${cycle.metrics.orgReviewsComplete}/${
                      cycle.metrics.orgReviewsComplete + cycle.metrics.orgReviewsPending
                    }`
                  : "—"
              }
              sub={
                cycle.metrics
                  ? `${cycle.metrics.orgReviewsPending} pending`
                  : ""
              }
              href="/performance/reviews"
            />
          </div>

          {/* Quick links */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Quick links
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <QuickLink icon={BarChart2} label="Scorecard" href="/performance/scorecard" />
              <QuickLink icon={Target} label="Goals" href="/performance/goals" />
              <QuickLink icon={Users} label="1:1s" href="/performance/one-on-one" />
              <QuickLink icon={CalendarDays} label="Feedback" href="/performance/feedback" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContextCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white border border-gray-200 rounded-xl p-5 hover:border-accent-300 hover:shadow-sm transition-all block"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="h-9 w-9 rounded-lg bg-gray-50 flex items-center justify-center">
          <Icon className="h-4 w-4 text-gray-500" />
        </div>
        <ArrowRight className="h-4 w-4 text-gray-300" />
      </div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-1">{sub}</p>}
    </Link>
  );
}

function QuickLink({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ElementType;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-gray-50 transition-colors text-gray-700"
    >
      <Icon className="h-3.5 w-3.5 text-gray-400" />
      {label}
    </Link>
  );
}

function formatReviewStatus(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    "self-assessment": "Self-assessment",
    "manager-review": "Manager review",
    calibration: "Calibration",
    approved: "Approved",
    shared: "Shared",
    signed: "Signed",
    submitted: "Submitted",
    finalized: "Finalized",
  };
  return labels[status] ?? status;
}
