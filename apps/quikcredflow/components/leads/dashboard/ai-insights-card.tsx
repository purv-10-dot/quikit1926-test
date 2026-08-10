"use client";

import { memo } from "react";
import { Brain, Sparkles } from "lucide-react";
import type { LeadInsights } from "@/lib/services/leads/lead-insights";

const RISK_STYLES = {
  low: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  high: "bg-rose-50 text-rose-800 ring-rose-200",
};

function ScoreBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-crm-muted">{label}</span>
        <span className="font-medium text-crm-text">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-crm-panel">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export const AiInsightsCard = memo(function AiInsightsCard({
  insights,
}: {
  insights: LeadInsights;
}) {
  return (
    <section className="crm-card overflow-hidden border border-crm-border/80 bg-gradient-to-br from-violet-50/80 via-white to-sky-50/50 p-4 shadow-sm dark:from-violet-950/30 dark:via-slate-900 dark:to-sky-950/20">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
          <Brain size={18} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-crm-text">Lead intelligence</h3>
          <p className="text-xs text-crm-muted">Signals from your CRM activity</p>
        </div>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${RISK_STYLES[insights.riskLevel]}`}
        >
          {insights.riskLevel} risk
        </span>
      </div>

      <div className="space-y-3">
        <ScoreBar label="Health" value={insights.healthScore} tone="bg-emerald-500" />
        <ScoreBar label="Engagement" value={insights.engagementScore} tone="bg-sky-500" />
        <ScoreBar
          label="Conversion probability"
          value={insights.conversionProbability}
          tone="bg-violet-500"
        />
      </div>

      {insights.lastResponseHours != null ? (
        <p className="mt-3 text-xs text-crm-muted">
          Last touch:{" "}
          <span className="font-medium text-crm-text">
            {insights.lastResponseHours < 24
              ? `${Math.round(insights.lastResponseHours)}h ago`
              : `${Math.round(insights.lastResponseHours / 24)}d ago`}
          </span>
        </p>
      ) : null}

      <div className="mt-3 flex gap-2 rounded-lg border border-violet-200/60 bg-white/70 p-3 text-sm text-crm-text dark:bg-slate-900/50">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-violet-500" />
        <p>{insights.recommendedAction}</p>
      </div>
    </section>
  );
});
