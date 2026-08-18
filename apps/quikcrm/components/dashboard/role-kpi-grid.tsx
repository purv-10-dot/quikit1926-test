"use client";

/**
 * Role-specific KPI grid for the dashboard.
 *
 * Fetches from /api/dashboard/metrics which applies the exact same ACL
 * helpers as the module API routes (accountScopeFilter, resolveManagerTeam)
 * so counts here always match what users see in each module.
 *
 * Rendered card sets per role:
 *   Administrator  — Total Leads, Accounts, Contacts, Opportunities,
 *                    Revenue, Activities, Tasks, Quotes
 *   SalesManager   — Team Leads, Opportunities, Revenue, Activities,
 *                    Tasks, Quotes, Pipeline
 *   SalesUser      — My Leads, Opportunities, Revenue, Activities, Tasks, Quotes
 *   MarketingUser  — Campaigns, Active Campaigns, Marketing Leads,
 *                    Lead Sources, Conversion Rate
 *                    (No: Revenue, Opportunities, Quotes, Sales Activities)
 *   FinanceUser    — Revenue, Forecast Revenue, Opportunities,
 *                    Quotes, Won Deals
 *                    (No: Lead Activities, Sales Tasks, Campaign Metrics)
 */

import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart2,
  Building2,
  Calculator,
  CheckSquare,
  DollarSign,
  FileText,
  Layers,
  Megaphone,
  Radio,
  Target,
  TrendingUp,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { KpiCardSkeleton } from "./kpi-card-skeleton";
import type { RoleMetricsDto } from "@/lib/dashboard/role-metrics-types";

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------
// Carries the ACTIVE dashboard filters (from/to/ownerId) + the client TZ header,
// exactly like fetchSummary in dashboard-client. Previously this fetched with no
// params at all, so every KPI card silently showed all-time data regardless of
// the selected date chip / owner.
async function fetchRoleMetrics(
  qs: string,
  tz: string,
): Promise<{ success: boolean; data: RoleMetricsDto }> {
  const res = await fetch(`/api/dashboard/metrics?${qs}`, {
    credentials: "include",
    headers: { "X-Client-TZ": tz },
  });
  if (!res.ok) throw new Error(`Role metrics fetch failed (${res.status})`);
  return res.json() as Promise<{ success: boolean; data: RoleMetricsDto }>;
}

// ---------------------------------------------------------------------------
// Card definition
// ---------------------------------------------------------------------------
type CardDef = {
  title: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone: "blue" | "emerald" | "violet" | "amber" | "sky" | "rose";
  href: string;
};

const TONE_CLASS: Record<CardDef["tone"], string> = {
  blue: "text-crm-blue",
  emerald: "text-emerald-600",
  violet: "text-violet-600",
  amber: "text-amber-600",
  sky: "text-sky-600",
  rose: "text-rose-600",
};

const SKELETON_COUNT: Record<string, number> = {
  Administrator: 8,
  SalesManager: 7,
  SalesUser: 6,
  MarketingUser: 5,
  FinanceUser: 5,
};

// ---------------------------------------------------------------------------
// Card grid renderer (same visual pattern as ExecutiveKpiGrid)
// ---------------------------------------------------------------------------
function KpiCardGrid({
  cards,
  onNavigate,
}: {
  cards: CardDef[];
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <button
            key={c.title}
            type="button"
            onClick={() => onNavigate(c.href)}
            className="crm-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-crm-muted">{c.title}</p>
                <p className="mt-1 text-2xl font-semibold text-crm-text">{c.value}</p>
                {c.sub ? <p className="mt-1 text-xs text-crm-muted">{c.sub}</p> : null}
              </div>
              <Icon
                className={`h-7 w-7 shrink-0 opacity-80 ${TONE_CLASS[c.tone]}`}
                strokeWidth={1.5}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------
export const RoleKpiGrid = memo(function RoleKpiGrid({
  userRole,
  onNavigate,
  qs,
  tz,
}: {
  userRole: string;
  onNavigate: (path: string) => void;
  /** Active dashboard filter query string (from/to/ownerId) — same one the
   *  summary query uses, so the cards and the hero always agree. */
  qs: string;
  tz: string;
}) {
  const query = useQuery<{ success: boolean; data: RoleMetricsDto }>({
    // qs is part of the key so changing a date chip / owner refetches rather
    // than serving another range's cached numbers. activity-breakdown-widget
    // uses the SAME key + fetcher args so react-query still dedupes.
    queryKey: ["dashboard", "role-metrics", qs],
    queryFn: () => fetchRoleMetrics(qs, tz),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (query.isLoading || !query.data) {
    const n = SKELETON_COUNT[userRole] ?? 6;
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: n }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!query.data.success) return null;

  const { role, metrics } = query.data.data;

  // ─── Administrator ────────────────────────────────────────────────────────
  if (role === "Administrator") {
    const m = metrics;
    const cards: CardDef[] = [
      { title: "Total Leads", value: String(m.totalLeads), icon: Users, tone: "blue", href: "/leads" },
      { title: "Total Accounts", value: String(m.totalAccounts), icon: Building2, tone: "sky", href: "/accounts" },
      { title: "Total Contacts", value: String(m.totalContacts), icon: User, tone: "violet", href: "/contacts" },
      { title: "Total Opportunities", value: String(m.totalOpportunities), icon: TrendingUp, tone: "emerald", href: "/opportunities" },
      { title: "Total Revenue", value: m.totalRevenueDisplay, icon: DollarSign, tone: "emerald", href: "/opportunities", sub: "Won deals" },
      { title: "Total Activities", value: String(m.totalActivities), icon: Activity, tone: "amber", href: "/activities" },
      { title: "Total Tasks", value: String(m.totalTasks), icon: CheckSquare, tone: "rose", href: "/tasks" },
      { title: "Total Quotes", value: String(m.totalQuotes), icon: FileText, tone: "sky", href: "/quotes" },
    ];
    return <KpiCardGrid cards={cards} onNavigate={onNavigate} />;
  }

  // ─── Sales Manager ────────────────────────────────────────────────────────
  if (role === "SalesManager") {
    const m = metrics;
    const cards: CardDef[] = [
      {
        title: "Team Leads",
        value: String(m.teamLeads),
        icon: Users,
        tone: "blue",
        href: "/leads",
        sub: m.teamMemberCount > 0 ? `${m.teamMemberCount} reps` : undefined,
      },
      { title: "Team Opportunities", value: String(m.teamOpportunities), icon: TrendingUp, tone: "emerald", href: "/opportunities" },
      { title: "Team Revenue", value: m.teamRevenueDisplay, icon: DollarSign, tone: "emerald", href: "/opportunities", sub: "Won deals" },
      { title: "Team Activities", value: String(m.teamActivities), icon: Activity, tone: "amber", href: "/activities" },
      { title: "Team Tasks", value: String(m.teamTasks), icon: CheckSquare, tone: "rose", href: "/tasks" },
      { title: "Team Quotes", value: String(m.teamQuotes), icon: FileText, tone: "sky", href: "/quotes" },
      { title: "Team Pipeline", value: m.teamPipelineDisplay, icon: BarChart2, tone: "violet", href: "/opportunities", sub: "Open pipeline" },
    ];
    return <KpiCardGrid cards={cards} onNavigate={onNavigate} />;
  }

  // ─── Sales User ───────────────────────────────────────────────────────────
  if (role === "SalesUser") {
    const m = metrics;
    const cards: CardDef[] = [
      { title: "My Leads", value: String(m.myLeads), icon: Users, tone: "blue", href: "/leads?ownerId=me" },
      { title: "My Opportunities", value: String(m.myOpportunities), icon: TrendingUp, tone: "emerald", href: "/opportunities?ownerId=me" },
      { title: "My Revenue", value: m.myRevenueDisplay, icon: DollarSign, tone: "emerald", href: "/opportunities?ownerId=me", sub: "Won deals" },
      { title: "My Activities", value: String(m.myActivities), icon: Activity, tone: "amber", href: "/activities?ownerId=me" },
      { title: "My Tasks", value: String(m.myTasks), icon: CheckSquare, tone: "rose", href: "/tasks?mine=true" },
      { title: "My Quotes", value: String(m.myQuotes), icon: FileText, tone: "sky", href: "/quotes?ownerId=me" },
    ];
    return <KpiCardGrid cards={cards} onNavigate={onNavigate} />;
  }

  // ─── Marketing User ───────────────────────────────────────────────────────
  // No Revenue, Opportunities, Quotes, or Sales Activities shown.
  if (role === "MarketingUser") {
    const m = metrics;
    const topSource = m.leadSources[0];
    const cards: CardDef[] = [
      { title: "Campaigns", value: String(m.totalCampaigns), icon: Megaphone, tone: "violet", href: "/campaigns" },
      { title: "Active Campaigns", value: String(m.activeCampaigns), icon: Radio, tone: "emerald", href: "/campaigns", sub: "Currently running" },
      { title: "Marketing Leads", value: String(m.marketingLeads), icon: Users, tone: "blue", href: "/leads" },
      {
        title: "Lead Sources",
        value: String(m.leadSources.length),
        icon: Layers,
        tone: "sky",
        href: "/leads",
        sub: topSource ? `Top: ${topSource.source} (${topSource.count})` : "No source data",
      },
      {
        title: "Conversion Rate",
        value: m.conversionRate !== null ? `${m.conversionRate}%` : "—",
        icon: Target,
        tone: "amber",
        href: "/leads",
        sub: "Leads → Qualified",
      },
    ];
    return <KpiCardGrid cards={cards} onNavigate={onNavigate} />;
  }

  // ─── Finance User ─────────────────────────────────────────────────────────
  // No Lead Activities, Sales Tasks, or Campaign Metrics shown.
  if (role === "FinanceUser") {
    const m = metrics;
    const cards: CardDef[] = [
      { title: "Revenue", value: m.totalRevenueDisplay, icon: DollarSign, tone: "emerald", href: "/opportunities", sub: "Total won revenue" },
      { title: "Forecast Revenue", value: m.forecastRevenueDisplay, icon: Calculator, tone: "violet", href: "/opportunities", sub: "Weighted pipeline" },
      { title: "Opportunities", value: String(m.totalOpportunities), icon: TrendingUp, tone: "blue", href: "/opportunities", sub: "Open pipeline" },
      { title: "Quotes", value: String(m.totalQuotes), icon: FileText, tone: "sky", href: "/quotes" },
      { title: "Won Deals", value: String(m.wonDeals), icon: Trophy, tone: "emerald", href: "/opportunities", sub: "Closed won" },
    ];
    return <KpiCardGrid cards={cards} onNavigate={onNavigate} />;
  }

  return null;
});
