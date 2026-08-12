"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  Briefcase,
  Building2,
  CheckSquare,
  FileText,
  Globe,
  Mail,
  MessageSquare,
  Phone,
  Share2,
  TrendingUp,
  User,
  Users,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/dashboard/chart-card";
import { OverviewActivitySummary } from "@/components/overview/overview-kpi-grid";
import type { ExecutiveOverviewDto } from "@/lib/dashboard/executive-overview-types";

const FUNNEL_COLORS = ["#2563eb", "#3b82f6", "#7c3aed", "#0d9488", "#059669", "#d97706"];
const MIX_COLORS = ["#0ea5e9", "#2563eb", "#7c3aed", "#059669", "#d97706", "#94a3b8"];

const INSIGHT_STYLES = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  danger: "border-rose-200 bg-rose-50 text-rose-900",
} as const;

const FEED_ICONS = {
  lead: User,
  opp: Briefcase,
  quote: FileText,
  task: CheckSquare,
  call: Phone,
  activity: Activity,
} as const;

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function OverviewFunnel({ data }: { data: ExecutiveOverviewDto }) {
  const steps = data.funnel;
  return (
    <ChartCard title="Sales funnel" subtitle="Lead stages in selected period" height={300}>
      {steps.length === 0 ? (
        <p className="py-8 text-center text-sm text-crm-muted">No leads in this range.</p>
      ) : (
        <div className="flex h-full flex-col justify-between py-2">
          {steps.map((s, i) => {
            const width = Math.max(8, s.pct);
            const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length];
            return (
              <div key={s.stage} className="flex items-center gap-3">
                <div className="w-28 shrink-0 truncate text-xs font-medium text-crm-text">
                  {s.stage}
                </div>
                <div className="relative h-7 flex-1 rounded bg-crm-panel">
                  <div
                    className="absolute inset-y-0 left-0 rounded"
                    style={{ width: `${width}%`, backgroundColor: color }}
                  />
                </div>
                <div className="w-24 shrink-0 text-right text-xs tabular-nums text-crm-text">
                  {s.count} <span className="text-crm-muted">({s.pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

function OverviewPipelineHealth({ data }: { data: ExecutiveOverviewDto }) {
  const ph = data.pipelineHealth;
  return (
    <ChartCard title="Pipeline health" subtitle="Open deals by stage" height={300}>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-crm-panel/60 p-2">
          <p className="text-[10px] uppercase text-crm-muted">Total value</p>
          <p className="text-sm font-semibold text-crm-text">{ph.totalValueDisplay}</p>
        </div>
        <div className="rounded-lg bg-crm-panel/60 p-2">
          <p className="text-[10px] uppercase text-crm-muted">Avg deal</p>
          <p className="text-sm font-semibold text-crm-text">{ph.avgDealDisplay}</p>
        </div>
        <div className="rounded-lg bg-crm-panel/60 p-2">
          <p className="text-[10px] uppercase text-crm-muted">Aging 30d+</p>
          <p className="text-sm font-semibold text-amber-700">{ph.agingCount}</p>
        </div>
      </div>
      {ph.stages.length === 0 ? (
        <p className="text-center text-sm text-crm-muted">No open opportunities.</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={ph.stages} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="stage" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={48} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function OverviewActivityTrend({
  data,
  rangeDescription,
}: {
  data: ExecutiveOverviewDto;
  rangeDescription: string;
}) {
  const rows = data.activityTrend.map((d) => ({ label: d.label, activities: d.count }));
  return (
    <ChartCard
      title="Activity trend"
      subtitle={`Daily activity · ${rangeDescription}`}
      height={260}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
            angle={-15}
            textAnchor="end"
            height={48}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
          <Line type="monotone" dataKey="activities" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function OverviewActivityDoughnut({ data }: { data: ExecutiveOverviewDto }) {
  const mix = data.activityMix;
  const chartData = [
    { name: "Calls", value: mix.calls },
    { name: "Emails", value: mix.emails },
    { name: "Meetings", value: mix.meetings },
    { name: "Tasks", value: mix.tasks },
    { name: "Quotes", value: mix.quotes },
    { name: "Other", value: mix.notes + mix.other },
  ].filter((d) => d.value > 0);

  if (mix.total === 0) {
    return (
      <ChartCard title="Activity mix" subtitle="Distribution by type" height={260}>
        <p className="flex h-full items-center justify-center text-sm text-crm-muted">
          No activities in this period.
        </p>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Activity mix" subtitle="Distribution by type" height={260}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={MIX_COLORS[i % MIX_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v, name) => [Number(v ?? 0), String(name)]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {chartData.map((d, i) => (
          <span key={d.name} className="inline-flex items-center gap-1 text-[11px] text-crm-muted">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: MIX_COLORS[i % MIX_COLORS.length] }}
            />
            {d.name} ({d.value})
          </span>
        ))}
      </div>
    </ChartCard>
  );
}

function OverviewInsights({ data }: { data: ExecutiveOverviewDto }) {
  return (
    <section aria-label="AI insights">
      <h2 className="mb-3 text-sm font-semibold text-crm-text">Insights</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.insights.map((ins) => (
          <div
            key={ins.id}
            className={`rounded-lg border p-4 ${INSIGHT_STYLES[ins.tone]}`}
          >
            <p className="text-sm font-semibold">{ins.title}</p>
            <p className="mt-1 text-xs opacity-90">{ins.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataTable({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="crm-card overflow-hidden">
      <div className="border-b border-crm-border px-4 py-3">
        <h2 className="text-sm font-semibold text-crm-text">{title}</h2>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap bg-accent-50 px-3 py-2 text-left text-xs font-medium text-crm-text">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2 text-xs text-crm-text ${className}`}>
      {children}
    </td>
  );
}

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

const SCORE_COLOR = (score: number) => {
  if (score >= 50) return "bg-emerald-500";
  if (score >= 20) return "bg-accent-500";
  if (score >= 5) return "bg-amber-400";
  return "bg-slate-300";
};

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const hue = (name.charCodeAt(0) * 37 + name.charCodeAt(1 % name.length) * 13) % 360;
  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ backgroundColor: `hsl(${hue},55%,48%)` }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}

function StatPill({ value }: { value: number | string }) {
  return (
    <div className="w-12 text-center">
      <span className="text-sm font-semibold tabular-nums text-crm-text">{value}</span>
    </div>
  );
}

function OverviewLeaderboard({ data }: { data: ExecutiveOverviewDto }) {
  const maxScore = Math.max(...data.leaderboard.map((r) => r.activityScore), 1);

  return (
    <section className="crm-card overflow-hidden">
      <div className="border-b border-crm-border px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-crm-text">Salesperson leaderboard</h2>
            <p className="mt-0.5 text-xs text-crm-muted">Ranked by activity score for the selected period</p>
          </div>
          <div className="flex items-center gap-5 pr-1">
            {["Leads", "Calls", "Emails", "Meetings", "Won", "Revenue", "Score"].map((col) => (
              <span key={col} className="w-12 text-center text-[10px] font-semibold uppercase tracking-wide text-crm-muted">
                {col}
              </span>
            ))}
          </div>
        </div>
      </div>

      {data.leaderboard.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-crm-muted">No team activity in this period.</p>
      ) : (
        <ul className="divide-y divide-crm-border">
          {data.leaderboard.map((row) => (
            <li key={row.userId}>
            <Link
              href={`/overview/salesperson/${row.userId}`}
              className={`flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-accent-50/60 cursor-pointer ${
                row.isTop ? "bg-emerald-50/60" : ""
              }`}
            >
              {/* Rank */}
              <div className="w-8 shrink-0 text-center">
                {RANK_MEDAL[row.rank] ? (
                  <span className="text-xl leading-none">{RANK_MEDAL[row.rank]}</span>
                ) : (
                  <span className="text-sm font-semibold text-crm-muted">#{row.rank}</span>
                )}
              </div>

              {/* Avatar + Name */}
              <div className="flex min-w-[9rem] flex-1 items-center gap-2.5">
                <UserAvatar name={row.userName} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-crm-text">{row.userName}</p>
                  {row.isTop && (
                    <span className="text-[10px] font-medium text-emerald-700">Top performer</span>
                  )}
                </div>
              </div>

              {/* Stats + Score aligned with header */}
              <div className="ml-auto flex items-center gap-5 pr-1">
                <StatPill value={row.leadsCreated} />
                <StatPill value={row.calls} />
                <StatPill value={row.emails} />
                <StatPill value={row.meetings} />
                <StatPill value={row.dealsWon} />
                <StatPill value={row.revenueDisplay} />

                {/* Score */}
                <div className="w-12 shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-accent-700">{row.activityScore}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-crm-panel">
                    <div
                      className={`h-full rounded-full transition-all ${SCORE_COLOR(row.activityScore)}`}
                      style={{ width: `${Math.round((row.activityScore / maxScore) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const CHANNEL_ICON: Record<string, ReactNode> = {
  "Cold Calling": <Phone className="h-3.5 w-3.5" />,
  "Cold Call": <Phone className="h-3.5 w-3.5" />,
  Referral: <Users className="h-3.5 w-3.5" />,
  Website: <Globe className="h-3.5 w-3.5" />,
  Email: <Mail className="h-3.5 w-3.5" />,
  "Social Media": <Share2 className="h-3.5 w-3.5" />,
  Chat: <MessageSquare className="h-3.5 w-3.5" />,
  Event: <Zap className="h-3.5 w-3.5" />,
  Partner: <Briefcase className="h-3.5 w-3.5" />,
};

const CHANNEL_HUE = (name: string) =>
  (name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) * 47) % 360;

function ChannelIcon({ name }: { name: string }) {
  const icon = CHANNEL_ICON[name];
  const hue = CHANNEL_HUE(name);
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
      style={{ backgroundColor: `hsl(${hue},55%,48%)` }}
    >
      {icon ?? <TrendingUp className="h-3.5 w-3.5" />}
    </span>
  );
}

function OverviewChannelPerformance({ data }: { data: ExecutiveOverviewDto }) {
  const channels = data.channels;
  const totalLeads = channels.reduce((s, c) => s + c.leadCount, 0) || 1;
  const maxLeads = Math.max(...channels.map((c) => c.leadCount), 1);

  return (
    <section className="crm-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-crm-border px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-crm-text">Channel performance</h2>
            <p className="mt-0.5 text-xs text-crm-muted">Lead volume by source for the selected period</p>
          </div>
          {channels.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-crm-border bg-crm-panel px-3 py-1">
              <span className="text-xs font-semibold tabular-nums text-crm-text">{totalLeads}</span>
              <span className="text-[10px] text-crm-muted">total leads</span>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      {channels.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-crm-muted">No lead sources recorded in this period.</p>
      ) : (
        <ul className="divide-y divide-crm-border">
          {channels.map((ch, idx) => {
            const sharePct = Math.round((ch.leadCount / totalLeads) * 100);
            const barW = Math.round((ch.leadCount / maxLeads) * 100);
            const hue = CHANNEL_HUE(ch.channel);
            const isTop = idx === 0;

            return (
              <li
                key={ch.channel}
                className={`flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-crm-panel/50 ${
                  isTop ? "bg-blue-50/40" : ""
                }`}
              >
                {/* Rank */}
                <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-crm-muted">
                  {idx + 1}
                </span>

                {/* Icon */}
                <ChannelIcon name={ch.channel} />

                {/* Name + bar */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-crm-text">{ch.channel}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-crm-text">
                      {ch.leadCount}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-crm-border">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${barW}%`,
                        backgroundColor: `hsl(${hue},55%,48%)`,
                      }}
                    />
                  </div>
                </div>

                {/* Share badge */}
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: `hsl(${hue},55%,94%)`,
                    color: `hsl(${hue},45%,38%)`,
                  }}
                >
                  {sharePct}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function OverviewSections({
  data,
  priorLabel,
  rangeDescription,
}: {
  data: ExecutiveOverviewDto;
  priorLabel: string;
  rangeDescription: string;
  ownerId?: string | null;
}) {
  const tm = data.taskMonitor;

  return (
    <div className="space-y-6">
      <OverviewActivitySummary data={data} priorLabel={priorLabel} />

      <div className="grid gap-4 lg:grid-cols-2">
        <OverviewActivityTrend data={data} rangeDescription={rangeDescription} />
        <OverviewActivityDoughnut data={data} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OverviewFunnel data={data} />
        <OverviewPipelineHealth data={data} />
      </div>

      <OverviewInsights data={data} />

      <OverviewLeaderboard data={data} />

      <OverviewChannelPerformance data={data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Leads created" subtitle="New leads per day for the selected period" height={240}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.leadTrend} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="leadTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={24}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                formatter={(v) => [Number(v ?? 0), "Leads"]}
                labelStyle={{ fontWeight: 600, color: "#1e293b" }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#6366f1"
                strokeWidth={2.5}
                fill="url(#leadTrendGrad)"
                dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#6366f1", strokeWidth: 2, stroke: "#fff" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Target vs achievement" subtitle="Monthly revenue closed vs target" height={240}>
          {data.revenueAchievementPct === null ? (
            /* ── Empty state ── */
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-crm-panel">
                <TrendingUp className="h-5 w-5 text-crm-muted" />
              </div>
              <div>
                <p className="text-sm font-medium text-crm-text">No revenue data yet</p>
                <p className="mt-1 text-xs text-crm-muted">
                  Once deals are marked Closed-Won with a value, your achievement gauge will appear here.
                </p>
              </div>
            </div>
          ) : (
            /* ── Has data ── */
            <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
              {/* Radial progress ring */}
              <div className="relative" style={{ width: 110, height: 110 }}>
                <svg width="110" height="110" viewBox="0 0 110 110">
                  {/* Track */}
                  <circle cx="55" cy="55" r="44" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                  {/* Progress */}
                  <circle
                    cx="55" cy="55" r="44"
                    fill="none"
                    stroke={
                      (data.revenueAchievementPct ?? 0) >= 100
                        ? "#059669"
                        : (data.revenueAchievementPct ?? 0) >= 60
                        ? "#6366f1"
                        : "#f59e0b"
                    }
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 44}`}
                    strokeDashoffset={`${2 * Math.PI * 44 * (1 - Math.min(100, data.revenueAchievementPct ?? 0) / 100)}`}
                    transform="rotate(-90 55 55)"
                    style={{ transition: "stroke-dashoffset 0.6s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold tabular-nums text-crm-text">
                    {data.revenueAchievementPct}%
                  </span>
                  <span className="text-[10px] text-crm-muted">achieved</span>
                </div>
              </div>
              {/* Stats row */}
              <div className="flex w-full max-w-[220px] divide-x divide-crm-border rounded-xl border border-crm-border">
                <div className="flex-1 py-2 text-center">
                  <p className="text-[10px] text-crm-muted">Target</p>
                  <p className="text-xs font-semibold text-crm-text">{data.revenueTargetDisplay}</p>
                </div>
                <div className="flex-1 py-2 text-center">
                  <p className="text-[10px] text-crm-muted">Closed won</p>
                  <p className="text-xs font-semibold text-emerald-600">{data.executiveKpis.revenueThisMonthDisplay}</p>
                </div>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      <DataTable title="At-risk deals">
        <table className="min-w-full">
          <thead>
            <tr>
              <Th>Deal</Th>
              <Th>Company</Th>
              <Th>Value</Th>
              <Th>Stage</Th>
              <Th>Owner</Th>
              <Th>Last activity</Th>
              <Th>Risk</Th>
              <Th>Score</Th>
            </tr>
          </thead>
          <tbody>
            {data.atRiskDeals.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-crm-muted">
                  No at-risk deals detected.
                </td>
              </tr>
            ) : (
              data.atRiskDeals.map((d) => (
                <tr key={d.id} className="border-t border-crm-border">
                  <Td className="max-w-[140px] truncate font-medium">{d.dealName}</Td>
                  <Td>{d.company}</Td>
                  <Td>{d.valueDisplay}</Td>
                  <Td>{d.stage}</Td>
                  <Td>{d.ownerName}</Td>
                  <Td>{formatDate(d.lastActivityIso)}</Td>
                  <Td className="text-amber-700">{d.riskReason}</Td>
                  <Td>{d.riskScore}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTable>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="crm-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-crm-text">Live activity feed</h2>
          <ul className="max-h-80 space-y-3 overflow-y-auto">
            {data.liveFeed.length === 0 ? (
              <li className="text-sm text-crm-muted">No recent activity.</li>
            ) : (
              data.liveFeed.map((item) => {
                const Icon = FEED_ICONS[item.icon];
                return (
                  <li key={item.id} className="flex gap-3 text-xs">
                    <span className="shrink-0 tabular-nums text-crm-muted">
                      {formatTime(item.at)}
                    </span>
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600" />
                    <span className="text-crm-text">
                      <span className="font-medium">{item.userName}</span> {item.action}
                      {item.detail ? ` — ${item.detail}` : ""}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="crm-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-crm-text">Tasks & follow-ups</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-crm-border p-3">
              <p className="text-xs text-crm-muted">Pending</p>
              <p className="text-2xl font-semibold">{tm.pending}</p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs text-rose-700">Overdue</p>
              <p className="text-2xl font-semibold text-rose-800">{tm.overdue}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">Completed today</p>
              <p className="text-2xl font-semibold text-emerald-800">{tm.completedToday}</p>
            </div>
            <div className="rounded-lg border border-crm-border p-3">
              <p className="text-xs text-crm-muted">Upcoming follow-ups</p>
              <p className="text-2xl font-semibold">{tm.upcomingFollowUps}</p>
            </div>
          </div>
        </div>
      </div>

      <DataTable title="User login & CRM usage">
        <table className="min-w-full">
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Last login</Th>
              <Th>Last activity</Th>
              <Th>Session</Th>
              <Th>Usage score</Th>
            </tr>
          </thead>
          <tbody>
            {data.usage.map((u) => (
              <tr
                key={u.userId}
                className={`border-t border-crm-border ${u.inactive ? "bg-amber-50/40" : ""}`}
              >
                <Td className="font-medium">{u.userName}</Td>
                <Td>{u.role}</Td>
                <Td>{formatDate(u.lastLoginIso)}</Td>
                <Td>{formatDate(u.lastActivityIso)}</Td>
                <Td>{u.sessionHint}</Td>
                <Td>{u.usageScore}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>

      <DataTable title="Top customers">
        <table className="min-w-full">
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Revenue</Th>
              <Th>Open deals</Th>
              <Th>Last interaction</Th>
              <Th>Owner</Th>
            </tr>
          </thead>
          <tbody>
            {data.topCustomers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-crm-muted">
                  No accounts yet.
                </td>
              </tr>
            ) : (
              data.topCustomers.map((c) => (
                <tr key={c.accountId} className="border-t border-crm-border">
                  <Td className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-crm-muted" />
                      {c.name}
                    </span>
                  </Td>
                  <Td>{c.revenueDisplay}</Td>
                  <Td>{c.openDeals}</Td>
                  <Td>{formatDate(c.lastInteractionIso)}</Td>
                  <Td>{c.ownerName}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
