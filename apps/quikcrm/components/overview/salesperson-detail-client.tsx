"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  AreaChart, Area, BarChart, Bar, Cell,
  PieChart, Pie, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft, Briefcase, Mail, Phone, Users, CalendarCheck, CheckSquare,
  Activity, Star, FileText, Clock, PhoneCall, PhoneIncoming, PhoneOutgoing,
  StickyNote, TrendingUp, RotateCcw, FileCheck, BadgeCheck, LogIn, Zap,
  TrendingDown, Minus, DollarSign, AlertCircle, ChevronRight,
  BarChart2, Target,
  // Export additions
  Download, FileDown, Send, X, ChevronDown, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type {
  SalespersonDetailDto,
  SalespersonActivityRow,
  SalespersonCallRow,
  SalespersonTaskRow,
  SalespersonNoteRow,
  SalespersonConversionRow,
  SalespersonQuoteRow,
  SalespersonOpportunityRow,
  SalespersonAuditRow,
  SalespersonHeatmapDay,
  SalespersonCallDurationBucket,
  SalespersonFunnelStage,
  SalespersonActivityTarget,
} from "@/lib/dashboard/salesperson-detail-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function UserAvatar({ name, size = "lg" }: { name: string; size?: "sm" | "lg" }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const hue = (name.charCodeAt(0) * 37 + name.charCodeAt(1 % name.length) * 13) % 360;
  const dim = size === "lg" ? "h-14 w-14 text-lg" : "h-8 w-8 text-xs";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${dim}`}
      style={{ backgroundColor: `hsl(${hue},55%,48%)` }}>
      {initials || "?"}
    </span>
  );
}

const SOURCE_COLORS = ["#6366f1", "#0ea5e9", "#059669", "#d97706", "#7c3aed", "#94a3b8"];
const STAGE_COLORS  = ["#2563eb", "#3b82f6", "#7c3aed", "#0d9488", "#059669", "#d97706"];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDuration(sec: number | null) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtResponseTime(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Delta pill ────────────────────────────────────────────────────────────────

function DeltaPill({ current, prev }: { current: number; prev: number }) {
  if (prev === 0 && current === 0) return null;
  if (prev === 0) {
    return (
      <span className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
        <TrendingUp className="h-2.5 w-2.5" /> New
      </span>
    );
  }
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct === 0) {
    return (
      <span className="flex items-center gap-0.5 rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
        <Minus className="h-2.5 w-2.5" /> 0%
      </span>
    );
  }
  const up = pct > 0;
  return (
    <span className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${up ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {up ? "+" : ""}{pct}%
    </span>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────

const PRIORITY_STYLE: Record<string, string> = {
  High: "bg-red-100 text-red-700", Medium: "bg-amber-100 text-amber-700", Low: "bg-slate-100 text-slate-600",
};
const TASK_STATUS_STYLE: Record<string, string> = {
  Open: "bg-blue-100 text-blue-700", InProgress: "bg-indigo-100 text-indigo-700",
  Completed: "bg-emerald-100 text-emerald-700", Cancelled: "bg-slate-100 text-slate-500",
};
const STAGE_COLOR_MAP: Record<string, string> = {
  New: "bg-blue-100 text-blue-800", Contacted: "bg-cyan-100 text-cyan-800",
  Qualified: "bg-violet-100 text-violet-800", Negotiation: "bg-amber-100 text-amber-800",
  "Closed Won": "bg-emerald-100 text-emerald-800", "Closed Lost": "bg-red-100 text-red-800",
};
const QUOTE_STATUS_STYLE: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600", Sent: "bg-sky-100 text-sky-700",
  Won: "bg-emerald-100 text-emerald-700", Lost: "bg-red-100 text-red-700",
  Approved: "bg-violet-100 text-violet-700",
};
const OPP_STAGE_STYLE: Record<string, string> = {
  Prospecting: "bg-blue-50 text-blue-700", Qualification: "bg-cyan-50 text-cyan-700",
  Proposal: "bg-indigo-50 text-indigo-700", Negotiation: "bg-amber-50 text-amber-700",
  ClosedWon: "bg-emerald-50 text-emerald-700", ClosedLost: "bg-red-50 text-red-700",
};
const ACTION_STYLE: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700", update: "bg-sky-50 text-sky-700",
  delete: "bg-red-50 text-red-700", convert: "bg-violet-50 text-violet-700",
};

function Badge({ label, cls }: { label: string; cls?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls ?? "bg-slate-100 text-slate-600"}`}>
      {label}
    </span>
  );
}

function LeadChip({ name, company, leadId }: { name: string | null; company: string | null; leadId?: string | null }) {
  const router = useRouter();
  if (!name) return null;
  const clickable = !!leadId;
  return (
    <div
      onClick={clickable ? (e) => { e.stopPropagation(); router.push(`/leads/${leadId}`); } : undefined}
      className={`flex items-center gap-1 rounded-md border border-crm-border bg-crm-panel px-1.5 py-0.5 text-[10px] text-crm-muted ${clickable ? "cursor-pointer hover:border-accent-400 hover:text-accent-600 transition-colors" : ""}`}
    >
      <Users className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate max-w-[140px]">{name}{company ? ` · ${company}` : ""}</span>
      {clickable && <ChevronRight className="h-2.5 w-2.5 shrink-0" />}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-28 rounded-xl bg-crm-panel" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-crm-panel" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-60 rounded-xl bg-crm-panel" /><div className="h-60 rounded-xl bg-crm-panel" />
      </div>
      <div className="h-96 rounded-xl bg-crm-panel" />
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const allZero = data.every((v) => v === 0);
  const max = allZero ? 1 : Math.max(...data, 1);
  const w = 88, h = 36, padX = 2, padY = 4;

  const pts = data.map((v, i) => {
    const x = padX + (i / Math.max(data.length - 1, 1)) * (w - padX * 2);
    const y = allZero ? h - padY : h - padY - ((v / max) * (h - padY * 2));
    return { x, y };
  });

  const linePoints = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const fillPoints = `${pts[0].x},${h} ${linePoints} ${pts[pts.length - 1].x},${h}`;
  const last = pts[pts.length - 1];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      {!allZero && (
        <polyline points={fillPoints} fill={color} fillOpacity={0.1} stroke="none" />
      )}
      <polyline
        points={linePoints}
        fill="none"
        stroke={allZero ? "#e2e8f0" : color}
        strokeWidth={allZero ? "1.2" : "2"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={allZero ? "3 2" : undefined}
      />
      {!allZero && last && (
        <circle cx={last.x} cy={last.y} r="3" fill={color} stroke="white" strokeWidth="1.5" />
      )}
    </svg>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color, highlight, sparkData, sparkColor, delta }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  highlight?: boolean;
  sparkData?: number[];
  sparkColor?: string;
  delta?: React.ReactNode;
}) {
  return (
    <div className={`crm-card flex flex-col gap-1.5 p-4 ${highlight ? "ring-2 ring-accent-400/30" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>{icon}</div>
        {sparkData ? (
          <Sparkline data={sparkData} color={sparkColor ?? "#6366f1"} />
        ) : delta}
      </div>
      <p className="text-2xl font-bold tabular-nums text-crm-text">{value}</p>
      <div className="flex items-center justify-between gap-1">
        <p className="text-xs text-crm-muted">{label}</p>
        {sparkData && delta}
      </div>
    </div>
  );
}

// ── Activity Target ───────────────────────────────────────────────────────────
// Semantic status colors are hardcoded (data state — per CLAUDE.md, NOT accent-*).
// Thresholds and numbers come straight from the shared backend service.

const AT_STATUS_META: Record<
  SalespersonActivityTarget["status"],
  { label: string; badge: string; bar: string; text: string }
> = {
  green: { label: "On Target", badge: "bg-green-100 text-green-700", bar: "bg-green-500", text: "text-green-700" },
  yellow: { label: "At Risk", badge: "bg-yellow-100 text-yellow-700", bar: "bg-yellow-500", text: "text-yellow-700" },
  red: { label: "Below Target", badge: "bg-red-100 text-red-700", bar: "bg-red-500", text: "text-red-700" },
};

function ActivityTargetSection({ at }: { at: SalespersonActivityTarget }) {
  const meta = AT_STATUS_META[at.status];
  const barPct = Math.min(100, at.completionPct);

  const tiles: { label: string; value: number | string; accent?: boolean }[] = [
    { label: "Daily Target", value: at.dailyTarget },
    { label: "Today's Activities", value: at.todayActivities, accent: true },
    { label: "Remaining", value: at.remaining },
    { label: "Completion %", value: `${at.completionPct}%`, accent: true },
    { label: "Weekly Target", value: at.weeklyTarget },
    { label: "Weekly Activities", value: at.weeklyActivities },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-crm-muted">
          <Target className="h-3.5 w-3.5" /> Activity Target
        </p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.badge}`}>
          {meta.label}
        </span>
      </div>

      <div className="crm-card p-4">
        {/* Completion bar */}
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-crm-muted">
              Today: <span className="font-semibold text-crm-text">{at.todayActivities}</span> / {at.dailyTarget}
            </span>
            <span className={`font-semibold ${meta.text}`}>{at.completionPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${barPct}%` }} />
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border border-crm-border p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-crm-muted">{t.label}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${t.accent ? meta.text : "text-crm-text"}`}>
                {t.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Activity Heatmap ──────────────────────────────────────────────────────────

function ActivityHeatmap({ heatmap }: { heatmap: SalespersonHeatmapDay[] }) {
  const maxCount = Math.max(...heatmap.map((d) => d.count), 1);

  const getColor = (count: number) => {
    if (count === 0) return "#f1f5f9";
    const intensity = Math.min(count / maxCount, 1);
    if (intensity >= 0.8) return "#4f46e5";
    if (intensity >= 0.5) return "#818cf8";
    if (intensity >= 0.25) return "#a5b4fc";
    return "#e0e7ff";
  };

  // Group into weeks (Sun=0)
  const weeks: SalespersonHeatmapDay[][] = [];
  let currentWeek: SalespersonHeatmapDay[] = [];

  const firstDay = heatmap[0];
  if (firstDay) {
    const startDow = new Date(firstDay.date).getDay();
    for (let i = 0; i < startDow; i++) currentWeek.push({ date: "", count: -1 });
  }

  for (const day of heatmap) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push({ date: "", count: -1 });
    weeks.push(currentWeek);
  }

  const totalActivities = heatmap.reduce((s, d) => s + d.count, 0);
  const activeDays = heatmap.filter((d) => d.count > 0).length;

  return (
    <div className="crm-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-crm-border px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-crm-text">
            <BarChart2 className="h-4 w-4 text-accent-500" />
            Activity heatmap — last 90 days
          </h2>
          <p className="mt-0.5 text-xs text-crm-muted">
            {totalActivities} activities across {activeDays} active days
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-crm-muted">
          <span>Less</span>
          {["#f1f5f9", "#e0e7ff", "#a5b4fc", "#818cf8", "#4f46e5"].map((c) => (
            <span key={c} className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: c }} />
          ))}
          <span>More</span>
        </div>
      </div>
      <div className="overflow-x-auto px-5 py-4">
        <div className="flex gap-0.5">
          <div className="mr-1 flex flex-col justify-around">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} className="text-[9px] text-crm-muted" style={{ height: 13, lineHeight: "13px" }}>{d}</span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((day, di) => (
                <div
                  key={di}
                  title={day.date && day.count >= 0 ? `${day.date}: ${day.count} activities` : undefined}
                  className="rounded-sm"
                  style={{
                    width: 13, height: 13,
                    backgroundColor: day.count < 0 ? "transparent" : getColor(day.count),
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Pipeline Funnel ───────────────────────────────────────────────────────────

const FUNNEL_COLORS: Record<string, string> = {
  New: "#6366f1",
  Contacted: "#0ea5e9",
  Qualified: "#7c3aed",
  Negotiation: "#d97706",
  "Closed Won": "#059669",
  "Closed Lost": "#ef4444",
};

function PipelineFunnel({ funnel }: { funnel: SalespersonFunnelStage[] }) {
  if (!funnel.length) return null;
  const maxCount = Math.max(...funnel.map((s) => s.count), 1);

  return (
    <div className="crm-card overflow-hidden">
      <div className="border-b border-crm-border px-5 py-4">
        <h2 className="text-sm font-semibold text-crm-text">Pipeline funnel</h2>
        <p className="mt-0.5 text-xs text-crm-muted">Lead distribution across all pipeline stages</p>
      </div>
      <div className="space-y-2 px-5 py-4">
        {funnel.map((stage) => {
          const color = FUNNEL_COLORS[stage.stage] ?? "#94a3b8";
          const widthPct = Math.max(8, Math.round((stage.count / maxCount) * 100));
          return (
            <div key={stage.stage} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-right text-[11px] font-medium text-crm-text truncate">
                {stage.stage}
              </span>
              <div className="flex-1 rounded-full bg-crm-panel" style={{ height: 22 }}>
                <div
                  className="flex h-full items-center justify-end rounded-full px-2"
                  style={{ width: `${widthPct}%`, backgroundColor: color, transition: "width 0.6s ease" }}
                >
                  <span className="text-[10px] font-semibold text-white">{stage.count}</span>
                </div>
              </div>
              <span className="w-10 shrink-0 text-right text-[11px] text-crm-muted">{stage.pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Call Duration Histogram ───────────────────────────────────────────────────

function CallDurationChart({ buckets }: { buckets: SalespersonCallDurationBucket[] }) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  if (total === 0) return null;

  return (
    <div className="crm-card overflow-hidden">
      <div className="border-b border-crm-border px-5 py-4">
        <h2 className="text-sm font-semibold text-crm-text">Call duration breakdown</h2>
        <p className="mt-0.5 text-xs text-crm-muted">Distribution of {total} logged calls by duration</p>
      </div>
      <div className="px-4 py-4" style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
              formatter={(v: number) => [`${v} calls`, "Count"]}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {buckets.map((_, i) => (
                <Cell key={i} fill={["#6366f1", "#0ea5e9", "#059669", "#d97706", "#7c3aed"][i % 5]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId = "leads" | "activities" | "calls" | "tasks" | "notes" | "conversions" | "quotes" | "opportunities" | "audit";

const TAB_DEFS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "leads",         label: "Leads",          icon: <Users className="h-3.5 w-3.5" /> },
  { id: "conversions",   label: "Conversions",    icon: <BadgeCheck className="h-3.5 w-3.5" /> },
  { id: "opportunities", label: "Opportunities",  icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: "quotes",        label: "Quotes",         icon: <FileCheck className="h-3.5 w-3.5" /> },
  { id: "activities",    label: "Activities",     icon: <Activity className="h-3.5 w-3.5" /> },
  { id: "calls",         label: "Calls",          icon: <Phone className="h-3.5 w-3.5" /> },
  { id: "tasks",         label: "Tasks",          icon: <CheckSquare className="h-3.5 w-3.5" /> },
  { id: "notes",         label: "Notes",          icon: <StickyNote className="h-3.5 w-3.5" /> },
  { id: "audit",         label: "Audit log",      icon: <RotateCcw className="h-3.5 w-3.5" /> },
];

function TabBar({ active, setActive, counts, overdueCount }: {
  active: TabId; setActive: (t: TabId) => void; counts: Record<TabId, number>; overdueCount: number;
}) {
  return (
    <div className="flex gap-0.5 overflow-x-auto border-b border-crm-border px-4">
      {TAB_DEFS.map((t) => (
        <button
          key={t.id}
          onClick={() => setActive(t.id)}
          className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium transition-colors ${
            active === t.id
              ? "border-accent-600 text-accent-700"
              : "border-transparent text-crm-muted hover:text-crm-text"
          }`}
        >
          {t.icon}
          {t.label}
          {t.id === "tasks" && overdueCount > 0 && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
              {overdueCount} overdue
            </span>
          )}
          {counts[t.id] > 0 && !(t.id === "tasks" && overdueCount > 0) && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              active === t.id ? "bg-accent-100 text-accent-700" : "bg-crm-panel text-crm-muted"
            }`}>
              {counts[t.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <FileText className="mb-2 h-8 w-8 text-crm-border" />
      <p className="text-sm text-crm-muted">{message}</p>
    </div>
  );
}

// ── Tab panels ────────────────────────────────────────────────────────────────

function LeadsTab({ leads }: { leads: SalespersonDetailDto["recentLeads"] }) {
  const router = useRouter();
  if (!leads.length) return <EmptyState message="No leads created in this period." />;
  return (
    <ul className="divide-y divide-crm-border">
      {leads.map((lead) => (
        <li
          key={lead.id}
          onClick={() => router.push(`/leads/${lead.id}`)}
          className="flex cursor-pointer items-center gap-4 px-5 py-3.5 hover:bg-crm-panel/50 transition-colors"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-crm-text">{lead.name}</p>
            <p className="truncate text-xs text-crm-muted">{lead.company}{lead.source ? ` · ${lead.source}` : ""}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge label={lead.stage} cls={STAGE_COLOR_MAP[lead.stage] ?? "bg-slate-100 text-slate-600"} />
            <span className="text-[10px] text-crm-muted">{fmtDate(lead.createdAtIso)}</span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-crm-border" />
        </li>
      ))}
    </ul>
  );
}

function ConversionsTab({ conversions }: { conversions: SalespersonConversionRow[] }) {
  if (!conversions.length) return <EmptyState message="No leads converted in this period." />;
  return (
    <ul className="divide-y divide-crm-border">
      {conversions.map((c) => (
        <li key={c.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-crm-panel/50 transition-colors">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <BadgeCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-crm-text">{c.leadName}</p>
            <p className="truncate text-xs text-crm-muted">{c.leadCompany}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge label="Converted" cls="bg-emerald-100 text-emerald-700" />
            <span className="text-[10px] text-crm-muted">{fmtDate(c.convertedAtIso)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function OpportunitiesTab({ opportunities }: { opportunities: SalespersonOpportunityRow[] }) {
  if (!opportunities.length) return <EmptyState message="No opportunities in this period." />;
  return (
    <ul className="divide-y divide-crm-border">
      {opportunities.map((o) => (
        <li key={o.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-crm-panel/50 transition-colors">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-crm-text">{o.name}</p>
            <p className="truncate text-xs text-crm-muted">
              {o.accountName ?? "—"}
              {o.closeDate ? ` · Close: ${fmtDate(o.closeDate)}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge label={o.stage} cls={OPP_STAGE_STYLE[o.stage] ?? "bg-slate-100 text-slate-600"} />
            <span className="text-[11px] font-semibold text-crm-text">{o.amountDisplay}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function QuotesTab({ quotes }: { quotes: SalespersonQuoteRow[] }) {
  if (!quotes.length) return <EmptyState message="No quotes created in this period." />;
  return (
    <ul className="divide-y divide-crm-border">
      {quotes.map((q) => (
        <li key={q.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-crm-panel/50 transition-colors">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <FileCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-crm-text">{q.quoteNumber}</p>
            <p className="text-xs text-crm-muted">{fmtDate(q.createdAtIso)}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge label={q.status} cls={QUOTE_STATUS_STYLE[q.status] ?? "bg-slate-100 text-slate-600"} />
            <span className="text-[11px] font-semibold text-crm-text">{q.grandTotal}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ActivitiesTab({ activities }: { activities: SalespersonActivityRow[] }) {
  if (!activities.length) return <EmptyState message="No activities logged in this period." />;
  const typeIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes("call")) return <PhoneCall className="h-3.5 w-3.5" />;
    if (t.includes("email")) return <Mail className="h-3.5 w-3.5" />;
    if (t.includes("meeting")) return <CalendarCheck className="h-3.5 w-3.5" />;
    return <Activity className="h-3.5 w-3.5" />;
  };
  const typeColor = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes("call")) return "bg-sky-50 text-sky-600";
    if (t.includes("email")) return "bg-violet-50 text-violet-600";
    if (t.includes("meeting")) return "bg-teal-50 text-teal-600";
    return "bg-slate-50 text-slate-500";
  };
  return (
    <ul className="divide-y divide-crm-border">
      {activities.map((act) => (
        <li key={act.id} className="flex items-start gap-4 px-5 py-4 hover:bg-crm-panel/50 transition-colors">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${typeColor(act.type)}`}>
            {typeIcon(act.type)}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-crm-text">{act.subject}</p>
              <Badge label={act.type} />
            </div>
            {act.outcome && <p className="text-xs text-crm-muted"><span className="font-medium text-crm-text">Outcome:</span> {act.outcome}</p>}
            {act.detailNotes && <p className="text-xs text-crm-muted line-clamp-2">{act.detailNotes}</p>}
            <LeadChip name={act.leadName} company={act.leadCompany} leadId={act.leadId} />
          </div>
          <span className="shrink-0 whitespace-nowrap text-[10px] text-crm-muted">{timeAgo(act.occurredAtIso)}</span>
        </li>
      ))}
    </ul>
  );
}

function CallsTab({ calls }: { calls: SalespersonCallRow[] }) {
  if (!calls.length) return <EmptyState message="No calls logged in this period." />;
  return (
    <ul className="divide-y divide-crm-border">
      {calls.map((call) => {
        const isIn = call.direction?.toLowerCase() === "inbound";
        const isOut = call.direction?.toLowerCase() === "outbound";
        return (
          <li key={call.id} className="flex items-start gap-4 px-5 py-4 hover:bg-crm-panel/50 transition-colors">
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isIn ? "bg-emerald-50 text-emerald-600" : isOut ? "bg-sky-50 text-sky-600" : "bg-slate-50 text-slate-500"}`}>
              {isIn ? <PhoneIncoming className="h-4 w-4" /> : isOut ? <PhoneOutgoing className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-crm-text capitalize">{call.direction ?? "Call"} call</p>
                {call.status && <Badge label={call.status} />}
                {call.disposition && <Badge label={call.disposition} cls="bg-amber-50 text-amber-700" />}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-crm-muted">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDuration(call.durationSec)}</span>
                {call.startTimeIso && <span>{fmtDate(call.startTimeIso)}</span>}
              </div>
              {call.notes && <p className="text-xs text-crm-muted line-clamp-2">{call.notes}</p>}
              <LeadChip name={call.leadName} company={call.leadCompany} leadId={call.leadId} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TasksTab({ tasks }: { tasks: SalespersonTaskRow[] }) {
  if (!tasks.length) return <EmptyState message="No tasks assigned in this period." />;
  return (
    <ul className="divide-y divide-crm-border">
      {tasks.map((task) => (
        <li key={task.id} className={`flex items-start gap-4 px-5 py-4 hover:bg-crm-panel/50 transition-colors ${task.isOverdue ? "bg-red-50/30" : ""}`}>
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            task.isOverdue ? "bg-red-100 text-red-600" :
            task.status === "Completed" ? "bg-emerald-50 text-emerald-600" :
            task.status === "InProgress" ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"}`}>
            {task.isOverdue ? <AlertCircle className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-crm-text">{task.subject}</p>
              {task.isOverdue && <Badge label="Overdue" cls="bg-red-100 text-red-700" />}
              <Badge label={task.status} cls={TASK_STATUS_STYLE[task.status] ?? "bg-slate-100 text-slate-600"} />
              <Badge label={task.priority} cls={PRIORITY_STYLE[task.priority] ?? "bg-slate-100 text-slate-600"} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-crm-muted">
              {task.taskType && <span className="capitalize">{task.taskType}</span>}
              {task.dueDate && (
                <span className={`flex items-center gap-1 ${task.isOverdue ? "text-red-600 font-medium" : ""}`}>
                  <CalendarCheck className="h-3 w-3" />Due: {fmtDate(task.dueDate)}
                </span>
              )}
            </div>
            <LeadChip name={task.leadName} company={task.leadCompany} leadId={task.leadId} />
          </div>
          <span className="shrink-0 whitespace-nowrap text-[10px] text-crm-muted">{timeAgo(task.createdAtIso)}</span>
        </li>
      ))}
    </ul>
  );
}

function NotesTab({ notes }: { notes: SalespersonNoteRow[] }) {
  if (!notes.length) return <EmptyState message="No notes added in this period." />;
  return (
    <ul className="divide-y divide-crm-border">
      {notes.map((note) => (
        <li key={note.id} className="flex items-start gap-4 px-5 py-4 hover:bg-crm-panel/50 transition-colors">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-50 text-yellow-600">
            <StickyNote className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm text-crm-text">{note.content}</p>
            <LeadChip name={note.leadName} company={note.leadCompany} leadId={note.leadId} />
          </div>
          <span className="shrink-0 whitespace-nowrap text-[10px] text-crm-muted">{timeAgo(note.createdAtIso)}</span>
        </li>
      ))}
    </ul>
  );
}

function AuditTab({ audit }: { audit: SalespersonAuditRow[] }) {
  if (!audit.length) return <EmptyState message="No recorded changes in this period." />;
  return (
    <ul className="divide-y divide-crm-border">
      {audit.map((row) => {
        const action = row.action.toLowerCase();
        const aStyle = ACTION_STYLE[action] ?? "bg-slate-50 text-slate-600";
        return (
          <li key={row.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-crm-panel/50 transition-colors">
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${aStyle}`}>
              <RotateCcw className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge label={row.action} cls={aStyle} />
                <Badge label={row.module} cls="bg-crm-panel text-crm-muted" />
              </div>
              <p className="text-xs text-crm-text">{row.summary}</p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-[10px] text-crm-muted">{timeAgo(row.createdAtIso)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Export Menu ───────────────────────────────────────────────────────────────

function ExportMenu({
  userId,
  data,
  searchParams,
}: {
  userId: string;
  data: SalespersonDetailDto | null;
  searchParams: ReturnType<typeof useSearchParams>;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Pre-fill email modal defaults from data
  function openEmailModal() {
    setOpen(false);
    if (!data) return;
    setEmailTo(data.userEmail ?? "");
    setEmailSubject(`Sales Performance Report - ${data.userName}`);
    setEmailMessage("Please find attached the latest salesperson performance report.");
    setEmailModalOpen(true);
  }

  // Build shared query string (date range + tz) to pass to API
  function buildQs() {
    const params = new URLSearchParams();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (tz) params.set("tz", tz);
    return params.toString();
  }

  async function handleDownloadPdf() {
    setOpen(false);
    setPdfLoading(true);
    try {
      const qs = buildQs();
      const url = `/api/dashboard/salesperson/${userId}/export-pdf${qs ? `?${qs}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to generate PDF" }));
        throw new Error((err as { error?: string }).error ?? "Failed to generate PDF");
      }
      // Trigger browser download
      const blob = await res.blob();
      const anchor = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      anchor.href = objectUrl;
      // Read filename from Content-Disposition header if available
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      anchor.download = match?.[1] ?? `Salesperson-Report-${data?.userName ?? "report"}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success("PDF downloaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate PDF.");
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailTo.trim()) return;
    setEmailSending(true);
    try {
      const qs = buildQs();
      const url = `/api/dashboard/salesperson/${userId}/send-email${qs ? `?${qs}` : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailTo.trim(), subject: emailSubject, message: emailMessage }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error ?? "Failed to send report.");
      }
      toast.success("Report emailed successfully.");
      setEmailModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send report.");
    } finally {
      setEmailSending(false);
    }
  }

  return (
    <>
      {/* Dropdown trigger */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={!data || pdfLoading}
          className="flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-1.5 text-xs font-medium text-crm-muted transition-colors hover:border-accent-400 hover:text-accent-700 disabled:opacity-50"
        >
          {pdfLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          Export
          <ChevronDown className="h-3 w-3" />
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-crm-border bg-white shadow-crm-dropdown animate-in fade-in-0 zoom-in-95 duration-100">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-crm-text transition-colors hover:bg-crm-panel"
            >
              <Download className="h-3.5 w-3.5 text-crm-muted" />
              Download PDF
            </button>
            <div className="mx-3 border-t border-crm-border" />
            <button
              type="button"
              onClick={openEmailModal}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-crm-text transition-colors hover:bg-crm-panel"
            >
              <Send className="h-3.5 w-3.5 text-crm-muted" />
              Send Email
            </button>
          </div>
        )}
      </div>

      {/* Email modal */}
      {emailModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px]"
            onClick={() => setEmailModalOpen(false)}
          />
          {/* Modal */}
          <div
            role="dialog"
            aria-label="Send performance report"
            className="fixed inset-x-4 top-[10vh] z-50 mx-auto max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)] animate-in fade-in-0 zoom-in-95 duration-150"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-crm-border px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-100">
                  <Send className="h-4 w-4 text-accent-600" />
                </div>
                <h2 className="text-sm font-semibold text-crm-text">Send Performance Report</h2>
              </div>
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-crm-muted hover:bg-crm-panel hover:text-crm-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSendEmail} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-crm-text">
                  To Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="recipient@company.com"
                  className="w-full rounded-lg border border-crm-border bg-white px-3 py-2 text-sm text-crm-text outline-none transition focus-visible:ring-2 focus-visible:ring-accent-400"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-crm-text">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full rounded-lg border border-crm-border bg-white px-3 py-2 text-sm text-crm-text outline-none transition focus-visible:ring-2 focus-visible:ring-accent-400"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-crm-text">Message</label>
                <textarea
                  rows={3}
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  className="w-full resize-none rounded-lg border border-crm-border bg-white px-3 py-2 text-sm text-crm-text outline-none transition focus-visible:ring-2 focus-visible:ring-accent-400"
                />
                <p className="mt-1 text-[11px] text-crm-muted">
                  The PDF report will be attached automatically.
                </p>
              </div>

              {/* Footer buttons */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  className="rounded-lg border border-crm-border px-4 py-2 text-sm font-medium text-crm-text transition hover:bg-crm-panel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={emailSending || !emailTo.trim()}
                  className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-700 disabled:opacity-50"
                >
                  {emailSending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Send Report
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SalespersonDetailClient({ userId }: { userId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<SalespersonDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("leads");

  useEffect(() => {
    setLoading(true);
    const qs = searchParams.toString();
    // Send the client tz explicitly so activity-target windows (today/week) are
    // correct even on a cold deep-link where the `tz` cookie isn't set yet.
    let tz = "UTC";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* keep UTC */ }
    fetch(`/api/dashboard/salesperson/${userId}${qs ? `?${qs}` : ""}`, {
      headers: { "X-Client-TZ": tz },
    })
      .then((r) => { if (!r.ok) throw new Error("Failed to load."); return r.json() as Promise<SalespersonDetailDto>; })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : "Error"); setLoading(false); });
  }, [userId, searchParams]);

  if (loading) return <Skeleton />;
  if (error || !data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-600">{error ?? "Salesperson not found."}</p>
        <button onClick={() => router.back()} className="text-xs text-accent-600 underline">Go back</button>
      </div>
    );
  }

  const tabCounts: Record<TabId, number> = {
    leads: data.recentLeads.length,
    conversions: data.conversions.length,
    opportunities: data.opportunities.length,
    quotes: data.quotes.length,
    activities: data.activities.length,
    calls: data.calls.length,
    tasks: data.tasks.length,
    notes: data.notes.length,
    audit: data.auditLog.length,
  };

  const k = data.kpis;
  const p = data.prevKpis;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="crm-card px-6 py-5">
        <div className="flex flex-wrap items-center gap-5">
          <button onClick={() => router.back()}
            className="flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-1.5 text-xs font-medium text-crm-muted transition-colors hover:border-accent-400 hover:text-accent-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <UserAvatar name={data.userName} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-crm-text">{data.userName}</h1>
              {data.isTop && (
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                  <Star className="h-3 w-3" /> Top performer
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-crm-muted">{fmtDate(data.range.fromIso)} – {fmtDate(data.range.toIso)}</p>
          </div>

          {/* Send email button */}
          {data.userEmail && (
            <a
              href={`mailto:${data.userEmail}`}
              className="flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-1.5 text-xs font-medium text-crm-muted transition-colors hover:border-accent-400 hover:text-accent-700"
            >
              <Mail className="h-3.5 w-3.5" /> Email
            </a>
          )}

          {/* Export dropdown */}
          <ExportMenu userId={userId} data={data} searchParams={searchParams} />

          <div className="flex items-center gap-2 rounded-2xl border border-crm-border px-4 py-2.5">
            <Activity className="h-4 w-4 text-accent-500" />
            <div className="text-center">
              <p className="text-xl font-bold tabular-nums text-accent-700">{k.activityScore}</p>
              <p className="text-[10px] text-crm-muted">Activity score</p>
            </div>
          </div>
        </div>

        {/* ── Login & Activity status strip ── */}
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-crm-border pt-4">
          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full ${data.lastLoginIso ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
              <LogIn className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-crm-muted">Last login</p>
              {data.lastLoginIso ? (
                <p className="text-xs font-medium text-crm-text">
                  {fmtDate(data.lastLoginIso)}
                  <span className="ml-1.5 text-crm-muted">({timeAgo(data.lastLoginIso)})</span>
                </p>
              ) : (
                <p className="text-xs text-crm-muted">No login recorded</p>
              )}
            </div>
          </div>

          <div className="h-6 w-px bg-crm-border" />

          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full ${data.lastActivityIso ? "bg-sky-100 text-sky-600" : "bg-slate-100 text-slate-400"}`}>
              <Zap className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-crm-muted">Last CRM activity</p>
              {data.lastActivityIso ? (
                <p className="text-xs font-medium text-crm-text">
                  {fmtDate(data.lastActivityIso)}
                  <span className="ml-1.5 text-crm-muted">({timeAgo(data.lastActivityIso)})</span>
                </p>
              ) : (
                <p className="text-xs text-crm-muted">No activity recorded</p>
              )}
            </div>
          </div>

          {/* Avg response time */}
          <div className="h-6 w-px bg-crm-border" />
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-violet-600">
              <Clock className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-crm-muted">Avg. response time</p>
              <p className="text-xs font-medium text-crm-text">
                {fmtResponseTime(k.avgResponseTimeMins)}
                {k.avgResponseTimeMins !== null && (
                  <span className="ml-1.5 text-crm-muted">to first activity</span>
                )}
              </p>
            </div>
          </div>

          <div className="ml-auto">
            {data.lastLoginIso && (() => {
              const daysSince = Math.floor((Date.now() - new Date(data.lastLoginIso).getTime()) / 86400000);
              if (daysSince <= 1) return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">🟢 Active today</span>;
              if (daysSince <= 3) return <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">🔵 Active recently</span>;
              if (daysSince <= 7) return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">🟡 Logged in {daysSince}d ago</span>;
              return <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">🔴 Inactive for {daysSince} days</span>;
            })()}
            {!data.lastLoginIso && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">⚪ Never logged in</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Activity Target ── */}
      {data.activityTarget && <ActivityTargetSection at={data.activityTarget} />}

      {/* ── KPI row 1 — Pipeline ── */}
      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-crm-muted">Pipeline</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            icon={<Users className="h-4 w-4 text-white" />}
            label="Leads created"
            value={k.leadsCreated}
            color="bg-indigo-500"
            sparkData={data.sparklines.leads}
            sparkColor="#6366f1"
            delta={<DeltaPill current={k.leadsCreated} prev={p.leadsCreated} />}
          />
          <KpiCard
            icon={<BadgeCheck className="h-4 w-4 text-white" />}
            label="Leads converted"
            value={k.leadsConverted}
            color="bg-emerald-600"
            highlight={k.leadsConverted > 0}
            sparkData={data.sparklines.conversions}
            sparkColor="#059669"
            delta={<DeltaPill current={k.leadsConverted} prev={p.leadsConverted} />}
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4 text-white" />}
            label="Opportunities"
            value={k.opportunitiesCreated}
            color="bg-sky-500"
            sparkData={data.sparklines.opportunities}
            sparkColor="#0ea5e9"
          />
          <KpiCard
            icon={<Briefcase className="h-4 w-4 text-white" />}
            label="Deals won"
            value={k.dealsWon}
            color="bg-emerald-500"
            highlight={k.dealsWon > 0}
            sparkData={data.sparklines.opportunities}
            sparkColor="#10b981"
            delta={<DeltaPill current={k.dealsWon} prev={p.dealsWon} />}
          />
        </div>
      </div>

      {/* ── KPI row 2 — Revenue ── */}
      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-crm-muted">Revenue</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard
            icon={<DollarSign className="h-4 w-4 text-white" />}
            label="Revenue won"
            value={k.revenueWonDisplay}
            color="bg-emerald-600"
            highlight={k.revenueWon > 0}
            delta={<DeltaPill current={k.revenueWon} prev={p.revenueWon} />}
          />
          <KpiCard
            icon={<Briefcase className="h-4 w-4 text-white" />}
            label="Avg. deal size"
            value={k.avgDealSizeDisplay}
            color="bg-violet-500"
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4 text-white" />}
            label="Total pipeline"
            value={k.totalPipelineDisplay}
            color="bg-sky-500"
          />
        </div>
      </div>

      {/* ── KPI row 3 — Activity ── */}
      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-crm-muted">Activity</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            icon={<Phone className="h-4 w-4 text-white" />}
            label="Calls made"
            value={k.calls}
            color="bg-sky-500"
            sparkData={data.sparklines.calls}
            sparkColor="#0ea5e9"
            delta={<DeltaPill current={k.calls} prev={p.calls} />}
          />
          <KpiCard
            icon={<Mail className="h-4 w-4 text-white" />}
            label="Emails sent"
            value={k.emails}
            color="bg-violet-500"
            sparkData={data.sparklines.emails}
            sparkColor="#7c3aed"
            delta={<DeltaPill current={k.emails} prev={p.emails} />}
          />
          <KpiCard
            icon={<CalendarCheck className="h-4 w-4 text-white" />}
            label="Meetings"
            value={k.meetings}
            color="bg-teal-500"
            sparkData={data.sparklines.meetings}
            sparkColor="#0d9488"
            delta={<DeltaPill current={k.meetings} prev={p.meetings} />}
          />
          <KpiCard
            icon={<FileCheck className="h-4 w-4 text-white" />}
            label="Quotes created"
            value={k.quotesCreated}
            color="bg-pink-500"
            sparkData={data.sparklines.quotes}
            sparkColor="#ec4899"
          />
          <KpiCard
            icon={<CheckSquare className="h-4 w-4 text-white" />}
            label="Tasks done"
            value={k.tasksCompleted}
            color="bg-amber-500"
            sparkData={data.sparklines.tasks}
            sparkColor="#d97706"
            delta={<DeltaPill current={k.tasksCompleted} prev={p.tasksCompleted} />}
          />
          <KpiCard
            icon={<StickyNote className="h-4 w-4 text-white" />}
            label="Notes added"
            value={k.notesAdded}
            color="bg-yellow-500"
            sparkData={data.sparklines.notes}
            sparkColor="#ca8a04"
          />
        </div>

        {/* Overdue tasks alert */}
        {k.overdueTasksCount > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <p className="text-xs font-medium text-red-700">
              {k.overdueTasksCount} task{k.overdueTasksCount > 1 ? "s" : ""} overdue —{" "}
              <button
                onClick={() => setActiveTab("tasks")}
                className="underline hover:no-underline"
              >
                view in Tasks tab
              </button>
            </p>
          </div>
        )}
      </div>

      {/* ── Performance Report ── */}
      {(() => {
        const rates = [
          {
            label: "Lead conversion",
            desc: "Converted / created leads",
            value: k.leadsCreated > 0 ? Math.round((k.leadsConverted / k.leadsCreated) * 100) : null,
            num: k.leadsConverted,
            den: k.leadsCreated,
            color: "#6366f1",
            good: 30,
            great: 60,
          },
          {
            label: "Deal win rate",
            desc: "Won / (Won + Lost) deals",
            value: (k.dealsWon + k.dealsLost) > 0
              ? Math.round((k.dealsWon / (k.dealsWon + k.dealsLost)) * 100)
              : null,
            num: k.dealsWon,
            den: k.dealsWon + k.dealsLost,
            color: "#059669",
            good: 40,
            great: 65,
          },
          {
            label: "Quote win rate",
            desc: "Won / (Won + Lost) quotes",
            value: (k.quotesWon + k.quotesLost) > 0
              ? Math.round((k.quotesWon / (k.quotesWon + k.quotesLost)) * 100)
              : null,
            num: k.quotesWon,
            den: k.quotesWon + k.quotesLost,
            color: "#7c3aed",
            good: 35,
            great: 60,
          },
          {
            label: "Call connect rate",
            desc: "Connected / total calls",
            value: k.calls > 0 ? Math.round((k.callsConnected / k.calls) * 100) : null,
            num: k.callsConnected,
            den: k.calls,
            color: "#0ea5e9",
            good: 40,
            great: 70,
          },
          {
            label: "Task completion",
            desc: "Completed / total tasks",
            value: k.totalTasks > 0 ? Math.round((k.tasksCompleted / k.totalTasks) * 100) : null,
            num: k.tasksCompleted,
            den: k.totalTasks,
            color: "#d97706",
            good: 50,
            great: 80,
          },
        ];

        const validRates = rates.filter((r) => r.value !== null);
        const overallScore = validRates.length
          ? Math.round(validRates.reduce((s, r) => s + r.value!, 0) / validRates.length)
          : null;

        const grade = (v: number | null) => {
          if (v === null) return { label: "N/A", cls: "bg-slate-100 text-slate-500" };
          if (v >= 75) return { label: "Excellent", cls: "bg-emerald-100 text-emerald-700" };
          if (v >= 50) return { label: "Good", cls: "bg-sky-100 text-sky-700" };
          if (v >= 30) return { label: "Average", cls: "bg-amber-100 text-amber-700" };
          return { label: "Needs improvement", cls: "bg-red-100 text-red-700" };
        };

        const rateColor = (v: number | null, good: number, great: number) => {
          if (v === null) return "#94a3b8";
          if (v >= great) return "#059669";
          if (v >= good) return "#d97706";
          return "#ef4444";
        };

        const overallGrade = grade(overallScore);

        return (
          <div className="crm-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-crm-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-crm-text">Performance report</h2>
                <p className="mt-0.5 text-xs text-crm-muted">
                  Success &amp; fail rates across key CRM activities for this period
                </p>
              </div>
              {overallScore !== null && (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-2xl font-bold tabular-nums text-crm-text">{overallScore}%</p>
                    <p className="text-[10px] text-crm-muted">Overall score</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${overallGrade.cls}`}>
                    {overallGrade.label}
                  </span>
                </div>
              )}
            </div>

            <div className="grid gap-px bg-crm-border sm:grid-cols-2 lg:grid-cols-5">
              {rates.map((r) => {
                const pct = r.value ?? 0;
                const barColor = rateColor(r.value, r.good, r.great);
                const g = grade(r.value);
                const circumference = 2 * Math.PI * 28;
                const dash = r.value !== null ? circumference * (1 - pct / 100) : circumference;

                return (
                  <div key={r.label} className="flex flex-col items-center gap-3 bg-white px-4 py-5">
                    <div className="relative" style={{ width: 80, height: 80 }}>
                      <svg width="80" height="80" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="28" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                        {r.value !== null && (
                          <circle
                            cx="40" cy="40" r="28"
                            fill="none"
                            stroke={barColor}
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${circumference}`}
                            strokeDashoffset={`${dash}`}
                            transform="rotate(-90 40 40)"
                            style={{ transition: "stroke-dashoffset 0.6s ease" }}
                          />
                        )}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {r.value !== null ? (
                          <span className="text-base font-bold tabular-nums leading-none" style={{ color: barColor }}>
                            {pct}%
                          </span>
                        ) : (
                          <span className="text-xs text-crm-muted">—</span>
                        )}
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="text-xs font-semibold text-crm-text">{r.label}</p>
                      <p className="mt-0.5 text-[10px] text-crm-muted">{r.desc}</p>
                      {r.value !== null ? (
                        <p className="mt-1 text-[10px] tabular-nums text-crm-muted">
                          {r.num} / {r.den}
                        </p>
                      ) : (
                        <p className="mt-1 text-[10px] text-crm-muted">No data yet</p>
                      )}
                      <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.cls}`}>
                        {g.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {validRates.length > 0 && (() => {
              const insights: { tone: "success" | "warning" | "danger"; text: string }[] = [];
              for (const r of rates) {
                if (r.value === null) continue;
                if (r.value >= r.great) {
                  insights.push({ tone: "success", text: `${r.label} is excellent at ${r.value}%.` });
                } else if (r.value < r.good) {
                  insights.push({ tone: r.value < r.good / 2 ? "danger" : "warning", text: `${r.label} is low at ${r.value}% — needs attention.` });
                }
              }
              if (!insights.length) return null;
              const toneStyle = { success: "bg-emerald-50 text-emerald-800 border-emerald-200", warning: "bg-amber-50 text-amber-800 border-amber-200", danger: "bg-red-50 text-red-800 border-red-200" };
              return (
                <div className="border-t border-crm-border px-5 py-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-crm-muted">Insights</p>
                  <div className="flex flex-wrap gap-2">
                    {insights.map((ins, i) => (
                      <span key={i} className={`rounded-full border px-3 py-1 text-[11px] font-medium ${toneStyle[ins.tone]}`}>
                        {ins.tone === "success" ? "✅" : ins.tone === "warning" ? "⚠️" : "🔴"} {ins.text}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── Charts row ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="crm-card overflow-hidden">
          <div className="border-b border-crm-border px-5 py-4">
            <h2 className="text-sm font-semibold text-crm-text">Daily activity (last 14 days)</h2>
            <p className="mt-0.5 text-xs text-crm-muted">Leads created vs activities logged per day</p>
          </div>
          <div className="px-2 py-4" style={{ height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.activityTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spLeadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="spActGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} /><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} width={20} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} labelStyle={{ fontWeight: 600, color: "#1e293b" }} />
                <Area type="monotone" dataKey="leads" name="Leads" stroke="#6366f1" strokeWidth={2} fill="url(#spLeadGrad)" dot={false} />
                <Area type="monotone" dataKey="activities" name="Activities" stroke="#0ea5e9" strokeWidth={2} fill="url(#spActGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="crm-card overflow-hidden">
          <div className="border-b border-crm-border px-5 py-4">
            <h2 className="text-sm font-semibold text-crm-text">Lead sources</h2>
            <p className="mt-0.5 text-xs text-crm-muted">Where this salesperson&apos;s leads come from</p>
          </div>
          {data.sourceBreakdown.length === 0 ? (
            <div className="flex h-40 items-center justify-center"><p className="text-sm text-crm-muted">No source data.</p></div>
          ) : (
            <div className="flex items-center gap-3 px-5 py-4" style={{ height: 210 }}>
              <div className="shrink-0" style={{ width: 140, height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.sourceBreakdown} dataKey="count" nameKey="source" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} strokeWidth={0}>
                      {data.sourceBreakdown.map((_, i) => <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} formatter={(v, name) => [v, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="min-w-0 flex-1 space-y-2">
                {data.sourceBreakdown.map((s, i) => (
                  <li key={s.source} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                      <span className="truncate text-[11px] text-crm-text">{s.source}</span>
                    </div>
                    <span className="text-[11px] font-semibold tabular-nums text-crm-text">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── Stage bar ── */}
      {data.stageBreakdown.length > 0 && (
        <div className="crm-card overflow-hidden">
          <div className="border-b border-crm-border px-5 py-4">
            <h2 className="text-sm font-semibold text-crm-text">Leads by stage</h2>
            <p className="mt-0.5 text-xs text-crm-muted">All-time distribution across pipeline stages</p>
          </div>
          <div className="px-4 py-4" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stageBreakdown} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="stage" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} formatter={(v) => [v, "Leads"]} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.stageBreakdown.map((_, i) => <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Pipeline Funnel + Call Duration (side by side) ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PipelineFunnel funnel={data.funnel} />
        <CallDurationChart buckets={data.callDurationBuckets} />
      </div>

      {/* ── Activity Heatmap ── */}
      <ActivityHeatmap heatmap={data.heatmap} />

      {/* ── Full Activity Log (tabbed) ── */}
      <div className="crm-card overflow-hidden">
        <div className="border-b border-crm-border px-5 py-4">
          <h2 className="text-sm font-semibold text-crm-text">Complete activity log</h2>
          <p className="mt-0.5 text-xs text-crm-muted">
            Leads, conversions, opportunities, quotes, calls, tasks, notes, and full audit trail
          </p>
        </div>
        <TabBar
          active={activeTab}
          setActive={setActiveTab}
          counts={tabCounts}
          overdueCount={k.overdueTasksCount}
        />
        <div className="max-h-[600px] overflow-y-auto">
          {activeTab === "leads"         && <LeadsTab leads={data.recentLeads} />}
          {activeTab === "conversions"   && <ConversionsTab conversions={data.conversions} />}
          {activeTab === "opportunities" && <OpportunitiesTab opportunities={data.opportunities} />}
          {activeTab === "quotes"        && <QuotesTab quotes={data.quotes} />}
          {activeTab === "activities"    && <ActivitiesTab activities={data.activities} />}
          {activeTab === "calls"         && <CallsTab calls={data.calls} />}
          {activeTab === "tasks"         && <TasksTab tasks={data.tasks} />}
          {activeTab === "notes"         && <NotesTab notes={data.notes} />}
          {activeTab === "audit"         && <AuditTab audit={data.auditLog} />}
        </div>
      </div>
    </div>
  );
}
