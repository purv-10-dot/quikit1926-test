"use client";

import { memo } from "react";
import { Calendar, CheckSquare, DollarSign, Mail, Phone, StickyNote } from "lucide-react";
import type { LeadDashboardSnapshot } from "@/lib/services/leads/dashboard-snapshot";
import type { TabKey } from "@/components/leads/lead-detail-tabs";

interface KpiDef {
  title: string;
  value: string;
  icon: typeof Phone;
  tone: "blue" | "emerald" | "violet" | "amber" | "sky" | "rose";
  tab: TabKey;
}

const TONE_TEXT: Record<KpiDef["tone"], string> = {
  blue: "text-crm-blue",
  emerald: "text-emerald-600",
  violet: "text-violet-600",
  amber: "text-amber-600",
  sky: "text-sky-600",
  rose: "text-rose-600",
};

export const AdvancedKpiSection = memo(function AdvancedKpiSection({
  snapshot,
  loading,
  onNavigateTab,
}: {
  snapshot: LeadDashboardSnapshot;
  loading?: boolean;
  onNavigateTab: (tab: TabKey) => void;
}) {
  const cards: KpiDef[] = [
    { title: "Calls", value: String(snapshot.callsCount), icon: Phone, tone: "sky", tab: "callDisposition" },
    { title: "Tasks", value: String(snapshot.openTasks), icon: CheckSquare, tone: "emerald", tab: "tasks" },
    { title: "Meetings", value: String(snapshot.meetingsCount), icon: Calendar, tone: "violet", tab: "timeline" },
    { title: "Emails", value: String(snapshot.emailsCount), icon: Mail, tone: "blue", tab: "timeline" },
    { title: "Notes", value: String(snapshot.notesCount), icon: StickyNote, tone: "amber", tab: "notes" },
    {
      title: "Revenue",
      value:
        snapshot.revenueTotal >= 1000
          ? `₹${(snapshot.revenueTotal / 1000).toFixed(1)}k`
          : `₹${snapshot.revenueTotal}`,
      icon: DollarSign,
      tone: "rose",
      tab: "opportunities",
    },
  ];

  if (loading) {
    return (
      <div className="crm-card mb-4 overflow-hidden">
        <div className="flex min-w-full divide-x divide-crm-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex min-w-[6rem] flex-1 items-center gap-2 px-3 py-2">
              <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-crm-border" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="h-2.5 w-10 animate-pulse rounded bg-crm-border" />
                <div className="h-3.5 w-8 animate-pulse rounded bg-crm-border" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="crm-card mb-4 overflow-hidden">
      <div className="crm-hscroll">
        <div className="flex min-w-full divide-x divide-crm-border">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.title}
                type="button"
                onClick={() => onNavigateTab(c.tab)}
                title={`${c.title}: ${c.value}`}
                className="flex min-w-[6rem] flex-1 items-center gap-2 px-3 py-2 text-left transition hover:bg-crm-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-400"
              >
                <Icon size={16} className={"shrink-0 " + TONE_TEXT[c.tone]} strokeWidth={1.75} />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[11px] uppercase tracking-wide text-crm-muted">
                    {c.title}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-crm-text">{c.value}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
