"use client";

/**
 * /reports hub — categories sidebar, 3-column card grid, drawer.
 *
 * URL state: `?canned=<id>&from=&to=&ownerId=`. Refreshes preserve the
 * open drawer + filters; deep links share the same shape.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  ExternalLink,
  HelpCircle,
  Phone,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ReportsToolbar } from "./reports-toolbar";
import { CannedReportDrawer } from "./canned-report-drawer";
import { ReportsHelpModal } from "./reports-help-modal";
import { useReportFavorites } from "./use-report-favorites";

/**
 * Curated starting set surfaced as one-click "Recommended" chips — the
 * reports analog of lead scoring's "Add recommended rules". Ids that aren't
 * in the loaded catalog are skipped, so this list is safe to over-specify.
 */
const RECOMMENDED_IDS = [
  "pipeline-by-stage",
  "leads-by-source",
  "lead-funnel",
  "calls-by-day",
  "team-conversion-rate",
];

type CannedCategory = "Pipeline" | "Leads" | "Activities" | "Telephony" | "Team";
type CannedSummary = {
  id: string;
  category: CannedCategory;
  title: string;
  blurb: string;
  helpText: string;
};

const CATEGORIES: CannedCategory[] = [
  "Pipeline",
  "Leads",
  "Activities",
  "Telephony",
  "Team",
];

/** Visual identity per category — icon + tinted background for the card icon block. */
const CATEGORY_THEME: Record<
  CannedCategory,
  { icon: LucideIcon; iconBg: string; iconFg: string; ring: string }
> = {
  Pipeline: {
    icon: TrendingUp,
    iconBg: "bg-blue-50",
    iconFg: "text-blue-600",
    ring: "ring-blue-100",
  },
  Leads: {
    icon: Users,
    iconBg: "bg-emerald-50",
    iconFg: "text-emerald-600",
    ring: "ring-emerald-100",
  },
  Activities: {
    icon: Activity,
    iconBg: "bg-amber-50",
    iconFg: "text-amber-600",
    ring: "ring-amber-100",
  },
  Telephony: {
    icon: Phone,
    iconBg: "bg-purple-50",
    iconFg: "text-purple-600",
    ring: "ring-purple-100",
  },
  Team: {
    icon: BarChart3,
    iconBg: "bg-rose-50",
    iconFg: "text-rose-600",
    ring: "ring-rose-100",
  },
};

interface ReportsHubProps {
  ownerOptions: { value: string; label: string }[];
  /** Whether the signed-in user holds `reports.export` (server-resolved). */
  canExport?: boolean;
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86400000);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function ReportsHub({ ownerOptions, canExport }: ReportsHubProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { favoriteIds, toggle, isFavorite } = useReportFavorites();

  const [reports, setReports] = useState<CannedSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CannedCategory>("Pipeline");
  /** Card whose help panel is currently visible (hover or focus). */
  const [hoverHelpId, setHoverHelpId] = useState<string | null>(null);
  /** Headline metric per report id. Lazy-loaded for the active category. */
  const [previews, setPreviews] = useState<
    Record<string, { label: string; value: number; display?: string } | null>
  >({});
  const [previewsLoading, setPreviewsLoading] = useState(false);

  // Memoize so the fallback `to` (a ms-precise `new Date()`) is stable across
  // renders. Without this, `to` changes every render → the previews effect and
  // the drawer's React Query key thrash → infinite re-render + perpetual load.
  const fallback = useMemo(defaultRange, []);
  const from = searchParams.get("from") || fallback.from;
  const to = searchParams.get("to") || fallback.to;
  const ownerId = searchParams.get("ownerId") || "";
  const openId = searchParams.get("canned") || "";

  const setUrl = useCallback(
    (patch: { canned?: string | null; from?: string; to?: string; ownerId?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (patch.canned === null) params.delete("canned");
      else if (patch.canned !== undefined) params.set("canned", patch.canned);
      if (patch.from !== undefined) params.set("from", patch.from);
      if (patch.to !== undefined) params.set("to", patch.to);
      if (patch.ownerId !== undefined) {
        if (patch.ownerId) params.set("ownerId", patch.ownerId);
        else params.delete("ownerId");
      }
      router.replace(`/reports/library?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports/canned")
      .then(async (res) => {
        const body = (await res.json()) as
          | { success: true; data: { items: CannedSummary[] } }
          | { success: false; error: string };
        if (cancelled) return;
        if (body.success) setReports(body.data.items);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const out = new Map<CannedCategory, CannedSummary[]>();
    for (const r of reports) {
      const list = out.get(r.category) ?? [];
      list.push(r);
      out.set(r.category, list);
    }
    return out;
  }, [reports]);

  const cards = grouped.get(activeCategory) ?? [];
  const openReport = reports.find((r) => r.id === openId);

  // Lazy-fetch headline previews for the cards currently on screen, so we
  // don't pay for all 15 reports' queries on first load. Refetches when
  // the user changes category or filters.
  useEffect(() => {
    if (cards.length === 0) return;
    const ids = cards.map((c) => c.id).join(",");
    const params = new URLSearchParams({ ids, from, to });
    if (ownerId) params.set("ownerId", ownerId);
    let cancelled = false;
    setPreviewsLoading(true);
    fetch(`/api/reports/canned/previews?${params.toString()}`)
      .then(async (res) => {
        const body = (await res.json()) as
          | {
              success: true;
              data: {
                items: {
                  id: string;
                  preview: { label: string; value: number; display?: string } | null;
                }[];
              };
            }
          | { success: false; error: string };
        if (cancelled || !body.success) return;
        setPreviews((prev) => {
          const next = { ...prev };
          for (const item of body.data.items) next[item.id] = item.preview;
          return next;
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPreviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // We intentionally key off the joined card ids and the URL filters; the
    // `cards` array reference changes every render but its contents are stable
    // per active category.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.map((c) => c.id).join(","), from, to, ownerId]);

  function formatPreview(p: {
    label: string;
    value: number;
    display?: string;
  }): string {
    if (p.display) return `${p.display} ${p.label.toLowerCase()}`;
    const n = p.value.toLocaleString("en-IN");
    return `${n} ${p.label.toLowerCase()}`;
  }

  const ownerLabel =
    ownerOptions.find((o) => o.value === ownerId)?.label ?? "All agents";
  const fmtDay = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  };
  const filterCaption = `${fmtDay(from)} → ${fmtDay(to)} · ${ownerLabel}`;
  const totalReports = reports.length;
  const favoriteReports = reports.filter((r) => favoriteIds.includes(r.id));
  const recommendedReports = RECOMMENDED_IDS.map((id) =>
    reports.find((r) => r.id === id),
  ).filter((r): r is CannedSummary => !!r);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-crm-text">
            <BookOpen size={18} className="text-accent-600" />
            Standard report library
          </h2>
          <p className="mt-0.5 text-sm text-crm-muted">
            Ready-made reports grouped by category. Set your filters, open a report,
            then drill in or export.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-crm-border px-3 text-xs font-medium text-crm-muted transition hover:bg-crm-panel hover:text-crm-text"
          aria-label="How reports work"
          title="How reports work"
        >
          <HelpCircle size={16} />
          Help
        </button>
      </div>

      <ReportsToolbar
        from={from}
        to={to}
        ownerId={ownerId}
        ownerOptions={ownerOptions}
        onChange={(next) => setUrl(next)}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-crm-muted">
        <span className="font-medium text-crm-text">Showing:</span>
        <span className="rounded-full bg-accent-50 px-2.5 py-0.5 font-medium text-accent-700">
          {filterCaption}
        </span>
        <span className="text-crm-muted">·</span>
        <span>
          {totalReports} standard {totalReports === 1 ? "report" : "reports"}
        </span>
      </div>

      {recommendedReports.length > 0 && (
        <section className="mb-6">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-crm-muted">
            <Sparkles size={14} className="text-accent-600" />
            Recommended
          </h3>
          <div className="flex flex-wrap gap-2">
            {recommendedReports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setUrl({ canned: r.id })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-crm-border bg-white px-3 py-1.5 text-sm font-medium text-crm-text transition hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700"
              >
                {r.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {favoriteReports.length > 0 && (
        <section className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-crm-muted">
            My favorites
          </h3>
          <div className="flex flex-wrap gap-2">
            {favoriteReports.map((r) => {
              return (
                <Link
                  key={r.id}
                  href={`/reports/${r.id}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${ownerId ? `&ownerId=${encodeURIComponent(ownerId)}` : ""}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:border-amber-300"
                >
                  <Star size={14} className="fill-amber-500 text-amber-500" />
                  {r.title}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[200px_1fr]">
        <aside className="md:sticky md:top-4 md:self-start">
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-crm-muted">
            Categories
          </div>
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:gap-1">
            {CATEGORIES.map((cat) => {
              const count = grouped.get(cat)?.length ?? 0;
              const active = activeCategory === cat;
              const theme = CATEGORY_THEME[cat];
              const Icon = theme.icon;
              return (
                <li key={cat} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-accent-50 text-accent-700"
                        : "text-crm-fg hover:bg-crm-panel"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon
                        size={16}
                        className={active ? "text-accent-700" : theme.iconFg}
                      />
                      <span className="font-medium">{cat}</span>
                    </span>
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-semibold ${
                        active
                          ? "bg-accent-200 text-accent-800"
                          : "bg-crm-panel text-crm-muted"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section>
          {loading && (
            <div className="rounded-xl border border-dashed border-crm-border bg-white p-10 text-center text-sm text-crm-muted">
              Loading reports…
            </div>
          )}
          {!loading && cards.length === 0 && (
            <div className="rounded-xl border border-dashed border-crm-border bg-white p-10 text-center text-sm text-crm-muted">
              No reports in this category yet.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {cards.map((r) => {
              const theme = CATEGORY_THEME[r.category];
              const Icon = theme.icon;
              const showHelp = hoverHelpId === r.id;
              const closeHelp = () => {
                setHoverHelpId((cur) => (cur === r.id ? null : cur));
              };
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setUrl({ canned: r.id })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setUrl({ canned: r.id });
                    }
                    if (e.key === "Escape" && showHelp) {
                      e.preventDefault();
                      closeHelp();
                    }
                  }}
                  className="group relative flex cursor-pointer flex-col items-stretch gap-3 rounded-xl border border-crm-border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent-400"
                >
                  <div className="flex items-start justify-between">
                    <div
                      className={`grid h-10 w-10 place-items-center rounded-lg ring-4 ${theme.iconBg} ${theme.ring}`}
                    >
                      <Icon size={18} className={theme.iconFg} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={isFavorite(r.id) ? "Remove from favorites" : "Add to favorites"}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(r.id);
                        }}
                        className={`rounded-full p-1 ${
                          isFavorite(r.id)
                            ? "text-amber-500"
                            : "text-crm-muted hover:text-amber-500"
                        }`}
                      >
                        <Star
                          size={14}
                          className={isFavorite(r.id) ? "fill-amber-500" : ""}
                        />
                      </button>
                      <span className="rounded-full bg-crm-panel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-crm-muted">
                        {r.category}
                      </span>
                      <button
                        type="button"
                        aria-label="How this report works"
                        aria-describedby={showHelp ? `help-${r.id}` : undefined}
                        onClick={(e) => e.stopPropagation()}
                        onMouseEnter={() => setHoverHelpId(r.id)}
                        onMouseLeave={() => closeHelp()}
                        onFocus={() => setHoverHelpId(r.id)}
                        onBlur={() => closeHelp()}
                        className={`rounded-full p-1 transition-colors ${
                          showHelp
                            ? "bg-accent-100 text-accent-700"
                            : "text-crm-muted hover:bg-crm-panel hover:text-accent-700"
                        }`}
                      >
                        <HelpCircle size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1">
                    <h3 className="text-sm font-semibold leading-snug text-crm-text">
                      {r.title}
                    </h3>
                    {(() => {
                      const p = previews[r.id];
                      if (previewsLoading && p === undefined) {
                        return (
                          <div className="mt-2 h-5 w-24 animate-pulse rounded bg-crm-panel" />
                        );
                      }
                      if (p) {
                        return (
                          <div className="mt-2 text-base font-semibold text-crm-text">
                            {formatPreview(p)}
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-crm-muted">
                      {r.blurb}
                    </p>
                  </div>

                  {showHelp && (
                    <div
                      id={`help-${r.id}`}
                      role="tooltip"
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-3 top-12 z-10 w-72 rounded-lg border border-accent-200 bg-white p-3 text-[11px] leading-relaxed text-crm-text shadow-lg"
                    >
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent-700">
                        How this works
                      </div>
                      <p>{r.helpText}</p>
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between border-t border-crm-border pt-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-crm-muted">
                      Quick view
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/reports/${r.id}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${ownerId ? `&ownerId=${encodeURIComponent(ownerId)}` : ""}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 text-[11px] font-medium text-accent-700 hover:underline"
                      >
                        Full page
                        <ExternalLink size={12} />
                      </Link>
                      <ArrowRight
                        size={16}
                        className="text-accent-600 transition-transform group-hover:translate-x-0.5"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {openReport && (
        <CannedReportDrawer
          reportId={openReport.id}
          title={openReport.title}
          blurb={openReport.blurb}
          open={true}
          onClose={() => setUrl({ canned: null })}
          from={from}
          to={to}
          ownerId={ownerId || undefined}
          filterCaption={`${fmtDay(from)} → ${fmtDay(to)} · ${ownerLabel}`}
          canExport={canExport}
        />
      )}

      <ReportsHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
