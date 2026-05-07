"use client";

/**
 * PageShell — Reusable page wrapper matching QuikScale page patterns.
 *
 * Provides:
 * - PageContainer: scrollable content area with consistent padding
 * - PageHeader: sticky header with title, subtitle, breadcrumbs, actions
 * - StatusChip: colored status badge
 * - KPICard: metric card for dashboards
 * - EmptyState: placeholder when no data
 * - SectionHeader: section divider inside detail pages
 */

import type { ReactNode } from "react";

// ─── PageContainer ──────────────────────────────────────────────────

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`p-6 max-w-[1600px] mx-auto ${className ?? ""}`}>
      {children}
    </div>
  );
}

// ─── PageHeader ─────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: ReactNode;
  onBack?: () => void;
}

export function PageHeader({ title, subtitle, breadcrumbs, actions, onBack }: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-slate-200 px-6 py-4">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-slate-300">/</span>}
              {crumb.href ? (
                <a href={crumb.href} className="hover:text-orange-600 transition-colors">
                  {crumb.label}
                </a>
              ) : (
                <span className="text-slate-900 font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg hover:bg-orange-50 hover:text-orange-700 text-slate-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="hidden sm:block w-1 h-6 rounded-full bg-gradient-to-b from-orange-500 to-orange-600" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900 tracking-tight">{title}</h1>
              {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ─── StatusChip ─────────────────────────────────────────────────────

// Five-tone semantic chip palette. Every status maps to one of these
// roles to keep the UI readable and on-brand (no per-status invented colors).
const CHIP_TONE = {
  neutral: "bg-slate-50 text-slate-600 border-slate-200",
  info:    "bg-sky-50 text-sky-700 border-sky-200",
  warn:    "bg-amber-50 text-amber-700 border-amber-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  danger:  "bg-rose-50 text-rose-700 border-rose-200",
  brand:   "bg-orange-50 text-orange-700 border-orange-200",
} as const;

const STATUS_COLORS: Record<string, string> = {
  // Neutral / lifecycle-ended
  inactive:                  CHIP_TONE.neutral,
  draft:                     CHIP_TONE.neutral,
  cancelled:                 CHIP_TONE.neutral,

  // Brand (warm) — returned / brand-flavoured movement
  returned:                  CHIP_TONE.brand,
  reversed:                  CHIP_TONE.brand,

  // Warn — anything pending / awaiting human action
  pending_approval:          CHIP_TONE.warn,
  submitted:                 CHIP_TONE.warn,
  pending_inspection:        CHIP_TONE.warn,
  conditional:               CHIP_TONE.warn,

  // Info — work moving forward / partial / dispatched
  in_progress:               CHIP_TONE.info,
  closed:                    CHIP_TONE.info,
  partially_received:        CHIP_TONE.info,
  partially_ordered:         CHIP_TONE.info,
  in_transit:                CHIP_TONE.info,
  dispatched:                CHIP_TONE.info,
  issued:                    CHIP_TONE.info,
  sent:                      CHIP_TONE.info,

  // Success — completed / accepted / fully done
  active:                    CHIP_TONE.success,
  approved:                  CHIP_TONE.success,
  approved_l1:               CHIP_TONE.success,
  approved_stock_available:  CHIP_TONE.success,
  approved_indent_required:  CHIP_TONE.success,
  completed:                 CHIP_TONE.success,
  received:                  CHIP_TONE.success,
  fully_received:            CHIP_TONE.success,
  fully_ordered:             CHIP_TONE.success,
  accepted:                  CHIP_TONE.success,

  // Danger
  rejected:                  CHIP_TONE.danger,
};

// Tone → dot-indicator color (the current text color is too pale for a
// 6px dot — pick a slightly punchier shade per tone so the dot reads at a
// glance without competing with the label).
const CHIP_DOT: Record<string, string> = {
  [CHIP_TONE.neutral]: "bg-slate-400",
  [CHIP_TONE.info]:    "bg-sky-500",
  [CHIP_TONE.warn]:    "bg-amber-500",
  [CHIP_TONE.success]: "bg-emerald-500",
  [CHIP_TONE.danger]:  "bg-rose-500",
  [CHIP_TONE.brand]:   "bg-orange-500",
};

export function StatusChip({ status }: { status: string }) {
  const safeStatus = status ?? "";
  const color = STATUS_COLORS[safeStatus] ?? CHIP_TONE.neutral;
  const dot = CHIP_DOT[color] ?? "bg-slate-400";
  const label = safeStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—";

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${color}`}>
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ─── KPICard ────────────────────────────────────────────────────────

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  icon?: ReactNode;
  color?: string;
  onClick?: () => void;
}

/**
 * Unified KPI palette for the construction-ERP look. Every legacy color
 * name (blue/purple/indigo/sky/...) is remapped to one of four harmonized
 * tones so dashboards across all modules share the same visual language:
 *
 *   • brand   — primary construction orange (default, "key" KPIs)
 *   • info    — slate-blue, used for neutral/informational counts
 *   • success — emerald, used for completed / positive metrics
 *   • danger  — rose, used for at-risk / overdue metrics
 *   • warn    — amber, used for pending / waiting metrics
 *
 * Pages that pass legacy strings ("blue", "purple", etc.) automatically
 * map into this palette — no per-page changes needed.
 */
const KPI_TONE: Record<string, { gradient: string; ring: string }> = {
  brand:   { gradient: "from-orange-500 to-orange-600",    ring: "ring-orange-100" },
  info:    { gradient: "from-slate-500 to-slate-700",      ring: "ring-slate-100" },
  success: { gradient: "from-emerald-500 to-emerald-600",  ring: "ring-emerald-100" },
  danger:  { gradient: "from-rose-500 to-rose-600",        ring: "ring-rose-100" },
  warn:    { gradient: "from-amber-500 to-amber-600",      ring: "ring-amber-100" },
};

const KPI_LEGACY_TO_TONE: Record<string, keyof typeof KPI_TONE> = {
  // brand family
  orange: "brand", amber: "warn", yellow: "warn",
  // info family
  blue: "info", sky: "info", indigo: "info", cyan: "info", slate: "info", gray: "info",
  // accent family — collapse purple/teal/pink into info to avoid rainbow
  purple: "info", violet: "info", pink: "info", rose: "danger", red: "danger",
  // success
  green: "success", emerald: "success", teal: "success", lime: "success",
};

export function KPICard({ title, value, subtitle, trend, icon, color = "brand", onClick }: KPICardProps) {
  const toneKey = (KPI_TONE[color as keyof typeof KPI_TONE]
    ? (color as keyof typeof KPI_TONE)
    : (KPI_LEGACY_TO_TONE[color] ?? "brand"));
  const tone = KPI_TONE[toneKey]!;

  return (
    <div
      onClick={onClick}
      className={`group relative bg-white rounded-xl border border-slate-200 p-5 shadow-soft overflow-hidden ${
        onClick
          ? "cursor-pointer hover:shadow-lg hover:border-orange-200 hover:-translate-y-0.5 transition-all duration-200"
          : ""
      }`}
    >
      {/* subtle accent stripe — strengthens to full opacity on hover */}
      <span
        aria-hidden
        className={`absolute top-0 left-0 h-0.5 w-full bg-gradient-to-r ${tone.gradient} opacity-70 group-hover:opacity-100 transition-opacity`}
      />
      {/* soft brand wash that fades in on hover — gives the lift effect a colour cue */}
      {onClick && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-orange-50/0 to-orange-50/0 group-hover:from-orange-50/40 group-hover:to-transparent transition-colors"
        />
      )}
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {icon && (
          <div
            className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tone.gradient} text-white flex items-center justify-center shadow-sm ring-4 ${tone.ring} transition-transform group-hover:scale-105`}
          >
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div className="relative mt-3 flex items-center gap-1">
          <span className={`text-xs font-semibold ${trend.value >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {trend.value >= 0 ? "▲ +" : "▼ "}{trend.value}%
          </span>
          <span className="text-xs text-slate-500">{trend.label}</span>
        </div>
      )}
    </div>
  );
}

// ─── EmptyState ─────────────────────────────────────────────────────

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
      {icon && (
        <div className="relative mb-5">
          {/* concentric brand-soft halos behind the icon — gives the empty
              state a focal point without adding noise to the page chrome. */}
          <span
            aria-hidden
            className="absolute inset-0 -m-3 rounded-full bg-orange-100/40 blur-md"
          />
          <span
            aria-hidden
            className="absolute inset-0 -m-1.5 rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100"
          />
          <div className="relative w-16 h-16 rounded-2xl bg-white text-orange-500 flex items-center justify-center ring-1 ring-orange-100 shadow-soft">
            {icon}
          </div>
        </div>
      )}
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── SectionHeader ──────────────────────────────────────────────────

export function SectionHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-200 mb-4">
      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
        <span aria-hidden className="w-1 h-4 rounded-full bg-gradient-to-b from-orange-500 to-orange-600" />
        {title}
      </h3>
      {actions}
    </div>
  );
}

// ─── Action Buttons ─────────────────────────────────────────────────

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-brand hover:shadow-lg hover:-translate-y-px active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────

export function TabBar({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: Array<{ key: string; label: string; count?: number }>;
  activeTab: string;
  onTabChange: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 px-6 bg-white">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`relative px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? "text-orange-700" : "text-slate-500 hover:text-orange-600"
            }`}
          >
            <span className="inline-flex items-center">
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`ml-1.5 rounded-full text-[10px] font-semibold px-1.5 py-0.5 transition-colors ${
                    isActive ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {/* Active underline rendered as an absolutely-positioned pill so
                it animates smoothly via `transform: scaleX` rather than the
                hard show/hide of border-bottom. */}
            <span
              aria-hidden
              className={`pointer-events-none absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 origin-left transition-transform ${
                isActive ? "scale-x-100" : "scale-x-0"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── ApprovalTimeline ───────────────────────────────────────────────

interface ApprovalTimelineEntry {
  step: number;
  action: string;
  actionBy: string;
  actionAt: string;
  comments?: string;
  /** Optional label override. When set, replaces the default
   *  "{Action} — Step {step}" heading (used for Requested / Next rows). */
  title?: string;
}

export function ApprovalTimeline({ entries }: { entries: ApprovalTimelineEntry[] }) {
  // Each tone gets a dot color + a soft outer ring color. The ring makes
  // active/in-flight steps feel like a "pulse" — calmer than animation.
  const actionTone: Record<string, { dot: string; ring: string }> = {
    approve:  { dot: "bg-emerald-500", ring: "ring-emerald-100" },
    reject:   { dot: "bg-rose-500",    ring: "ring-rose-100" },
    return:   { dot: "bg-orange-500",  ring: "ring-orange-100" },
    reverse:  { dot: "bg-orange-400",  ring: "ring-orange-100" },
    pending:  { dot: "bg-slate-300",   ring: "ring-slate-100" },
    request:  { dot: "bg-sky-500",     ring: "ring-sky-100" },
    current:  { dot: "bg-amber-500",   ring: "ring-amber-100" },
    upcoming: { dot: "bg-slate-200",   ring: "ring-slate-100" },
  };

  return (
    <div className="space-y-0">
      {entries.map((entry, i) => {
        const tone = actionTone[entry.action] ?? { dot: "bg-slate-300", ring: "ring-slate-100" };
        return (
          <div key={i} className="flex gap-3 relative">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${tone.dot} ring-4 ${tone.ring} mt-1.5 z-10`} />
              {i < entries.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
            </div>
            <div className="pb-4">
              <p className="text-sm font-medium text-slate-900">
                {entry.title ??
                  `${entry.action.charAt(0).toUpperCase() + entry.action.slice(1)} — Step ${entry.step}`}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {entry.actionBy} &middot; {entry.actionAt}
              </p>
              {entry.comments && (
                <p className="text-xs text-slate-600 mt-1 bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5 leading-relaxed">
                  {entry.comments}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Loading ────────────────────────────────────────────────────────

// Internal shimmer block — uses the project-wide shimmer keyframe defined
// in tailwind.config.ts. Gives skeletons a sweeping highlight rather than
// the flat opacity pulse of `animate-pulse`.
function SkelBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-slate-200/70 ${className}`}>
      <div
        aria-hidden
        className="absolute inset-0 bg-shimmer-gradient bg-[length:1000px_100%] animate-shimmer"
      />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <SkelBlock className="h-7 w-48" />
      <SkelBlock className="h-4 w-32" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {[1, 2, 3, 4].map((i) => (
          <SkelBlock key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <SkelBlock className="h-64 rounded-xl mt-6" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <SkelBlock className="h-10" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkelBlock key={i} className="h-12" />
      ))}
    </div>
  );
}
