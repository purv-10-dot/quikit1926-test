"use client";

/**
 * The generated report — live GA4 / Search Console / CRM data, with email
 * sending and print/PDF.
 *
 * This is the app's one real, data-backed report. It used to live at /reports;
 * the v15 UI update reframed /reports as a report LIBRARY and moved this page
 * here, reachable from the library's "Marketing performance" row.
 */
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getOverviewData, OVERVIEW_KPIS_SAMPLE, type OverviewData } from "@/lib/api/overview";
import { getInsights } from "@/lib/api/insights";
import { getGoogleAnalyticsData, type GoogleAnalyticsData } from "@/lib/api/google-analytics";
import { getSearchConsoleData, type SearchConsoleData } from "@/lib/api/search-console";
import { getCrmStats, type CrmStatsData } from "@/lib/api/crm-stats";
import { useToastStore } from "@/store/useToastStore";
import NotConnected from "@/components/ui/NotConnected";
import SampleDataBanner from "@/components/ui/SampleDataBanner";
import MockBadge from "@/components/ui/MockBadge";
import ConnectSourceBadge from "@/components/ui/ConnectSourceBadge";
import { SkeletonCard } from "@/components/ui/Skeleton";

type TimesheetRow = {
  date: string;
  user: string;
  avatar: string;
  project: string;
  task: string;
  hours: number;
  description: string;
  dummy: boolean;
  week?: string;
  month?: string;
};
import type { Insight } from "@/types";

/**
 * Pull one already-formatted metric off a PlatformCard by label.
 *
 * PlatformCard was reshaped into a generic `metrics: {label, value}[]` list, and
 * each platform names the same idea differently — Facebook reports "Fans" where
 * LinkedIn reports "Followers", YouTube "Subscribers". The table below wants
 * fixed columns, so accept the aliases and fall back to an em-dash rather than
 * rendering "undefined" for a platform that simply doesn't report that metric.
 */
function pickMetric(p: { metrics: { label: string; value: string }[] }, ...names: string[]): string {
  for (const n of names) {
    const hit = p.metrics.find((m) => m.label === n);
    if (hit) return hit.value;
  }
  return "—";
}

const TIMESHEET_VIEWS = [
  { label: "By Day", value: "daily" },
  { label: "By Week", value: "weekly" },
  { label: "By Month", value: "monthly" },
] as const;

const RANGES = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function pct(n: number): string {
  return `${(Number(n) * 100).toFixed(1)}%`;
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{title}</h3>
      {sub && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{sub}</span>}
    </div>
  );
}

function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", textAlign: "right" }}>
        {value}
        {sub && <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6, fontSize: 11 }}>{sub}</span>}
      </span>
    </div>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 56px", alignItems: "center", gap: 10, padding: "5px 0" }}>
      <span style={{ fontSize: 12.5, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${w}%`, borderRadius: 4, background: color }} />
      </div>
      <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "right" }}>{fmt(value)}</span>
    </div>
  );
}


/**
 * A saved report's scope, when this document is opened as one
 * (/reports/generated?report=<id>). Without the query param the page renders
 * the full unscoped report exactly as before.
 */
interface ReportScope {
  name: string;
  type: string;
  dateRange: string;
  channels: string[];
  customSummary: string | null;
  customMetrics: string[];
}

/** Which report channel each custom metric belongs to. */
const METRIC_CHANNEL: Record<string, string> = {
  paid_pipeline: "paid", paid_roas: "paid", paid_spend: "paid",
  organic_followers: "organic", organic_engagement: "organic", organic_reach: "organic",
  email_sends: "email", email_open: "email", email_click: "email",
  leads_total: "leads", leads_qualified: "leads",
};

/** KPI labels each custom metric maps onto in the overview KPI strip. */
const METRIC_KPI_LABELS: Record<string, string[]> = {
  organic_reach: ["Total Reach", "Reach"],
  organic_engagement: ["Engagement"],
  organic_followers: ["Followers"],
  paid_spend: ["Spend", "Paid spend"],
  paid_pipeline: ["Pipeline"],
  paid_roas: ["ROAS"],
  email_sends: ["Emails sent"],
  email_open: ["Open rate"],
  email_click: ["Click rate"],
  leads_total: ["Leads"],
  leads_qualified: ["Qualified leads"],
};

export default function ReportsPage() {
  const showToast = useToastStore((s) => s.show);
  const { data: session } = useSession();
  // Last 7 days by default — the report is a recent-performance snapshot.
  const [range, setRange] = useState(7);
  /** Non-null when opened as a saved report. */
  const [scope, setScope] = useState<ReportScope | null>(null);

  /** The saved report's id, when opened as one — used only for Phase 2 snapshotting below. */
  const [reportId, setReportId] = useState<string | null>(null);

  // Load the saved report's config, if this is one. The document then honours
  // its range, channel mix and — for a custom report — its metric selection,
  // instead of always rendering every section.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("report");
    if (!id) return;
    setReportId(id);
    fetch(`/api/reports/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success) return;
        const r = j.data as ReportScope;
        setScope(r);
        const n = Number(r.dateRange);
        if (Number.isFinite(n) && n > 0) setRange(n);
      })
      .catch(() => { /* fall back to the full report */ });
  }, []);
  const [data, setData] = useState<OverviewData | null>(null);
  const [ga4, setGa4] = useState<GoogleAnalyticsData | null>(null);
  const [gsc, setGsc] = useState<SearchConsoleData | null>(null);
  const [crm, setCrm] = useState<CrmStatsData | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailModal, setEmailModal] = useState(false);
  const [emailToTags, setEmailToTags] = useState<string[]>([]);
  const [emailToDraft, setEmailToDraft] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [tsView, setTsView] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [tsRows, setTsRows] = useState<TimesheetRow[]>([]);
  const [tsLoading, setTsLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getOverviewData(range),
      // Pass the selected range so every section covers the same period. These
      // previously used their route defaults (28 days), so the picker silently
      // changed only the KPI strip while the sections below stayed on 28 days.
      getGoogleAnalyticsData(range),
      getSearchConsoleData(range),
      getInsights(),
      getCrmStats(),
    ])
      .then(([ov, g4, sc, ins, crmData]) => {
        setData(ov);
        setGa4(g4);
        setGsc(sc);
        setInsights(ins);
        setCrm(crmData);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [range]);

  // Phase 2 of the report snapshot/comparison feature (PHASE_LOG.md): record
  // today's snapshot whenever a saved report's scoped view finishes loading.
  // Purely additive — fire-and-forget, no loading state, no UI feedback, and
  // failure is invisible to the viewer by design (the endpoint itself always
  // resolves 200; this effect ignores the response either way).
  const snapshottedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!reportId || loading || error) return;
    if (snapshottedRef.current === reportId) return;
    snapshottedRef.current = reportId;
    fetch(`/api/reports/${encodeURIComponent(reportId)}/snapshot`, { method: "POST" }).catch(() => {
      /* intentionally ignored — see lib/reports/snapshot.ts */
    });
  }, [reportId, loading, error]);

  useEffect(() => {
    setTsLoading(true);
    fetch(`/api/team/quikproject?view=${tsView}`)
      .then((r) => r.json())
      .then((d) => setTsRows(d.rows ?? []))
      .catch(() => setTsRows([]))
      .finally(() => setTsLoading(false));
  }, [tsView]);

  function commitToTag(raw: string) {
    const emails = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!emails.length) return;
    setEmailToTags((prev) => [...prev, ...emails.filter((e) => !prev.includes(e))]);
    setEmailToDraft("");
  }

  async function sendReport() {
    const toFromDraft = emailToDraft.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const to = [...emailToTags, ...toFromDraft.filter((e) => !emailToTags.includes(e))];
    if (!to.length) { showToast("Add at least one recipient"); return; }
    setSending(true);
    setEmailModal(false);
    try {
      const res = await fetch("/api/insights/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc: emailCc.split(/[,;]+/).map((s) => s.trim()).filter(Boolean),
          bcc: emailBcc.split(/[,;]+/).map((s) => s.trim()).filter(Boolean),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.sent) showToast(`Report emailed to ${(d.recipients ?? to).join(", ")}`);
      else showToast(d.reason || d.error || "Couldn't send — connect a platform and set recipients first");
    } catch {
      showToast("Failed to send report");
    } finally {
      setSending(false);
    }
  }

  const now = new Date();
  const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? `Last ${range} days`;

  // Channels the report actually asked for. A custom report never stores a
  // channel list — its scope is implied by the metric groups it picked, so
  // derive it rather than trusting a stale checkbox state.
  const activeChannels = new Set<string>(
    !scope
      ? ["paid", "organic", "email", "leads"]
      : scope.type === "custom"
        ? scope.customMetrics.map((m) => METRIC_CHANNEL[m]).filter(Boolean)
        : scope.channels,
  );
  const wants = (channel: string) => activeChannels.has(channel);
  const period = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const generatedAt = now.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  // Sampling is all-or-nothing per workspace (see lib/api/sample.ts): with
  // nothing connected every source hands back a sample; the moment anything is
  // connected samples stop everywhere. So these flags rise and fall together,
  // and one of them is enough to decide the page-level banner.
  const ga4IsMock = Boolean(ga4?.isSampleData);
  const gscIsMock = Boolean(gsc?.isSampleData);
  const crmIsMock = Boolean(crm?.isSampleData);
  const everythingIsMock = ga4IsMock || gscIsMock || crmIsMock;

  // KPI strip only falls back to the sample in that same nothing-connected
  // state; on a live workspace it shows real totals, zeros included.
  const allKpis = everythingIsMock ? OVERVIEW_KPIS_SAMPLE : data?.kpis ?? [];
  // A custom report shows ONLY the KPIs it selected. Anything else would hand
  // the reader numbers they explicitly did not ask for.
  const kpis =
    scope?.type === "custom"
      ? allKpis.filter((k) =>
          scope.customMetrics.some((m) =>
            (METRIC_KPI_LABELS[m] ?? []).some(
              (label) => label.toLowerCase() === k.label.toLowerCase(),
            ),
          ),
        )
      : allKpis;

  // Section-level scoping. Each section already renders only when its data is
  // present, so nulling the data here is all it takes to drop the section.
  // Sections are gated inline as `wants(channel) && <data> && (...)` so
  // TypeScript keeps narrowing the data inside each block.

  // On a LIVE workspace an unconnected source shows real zeros plus a "Connect
  // source" marker — never invented figures sitting beside genuine ones.
  const ga4NeedsConnect = !everythingIsMock && !ga4?.connected;
  const gscNeedsConnect = !everythingIsMock && !gsc?.connected;
  const crmNeedsConnect = !everythingIsMock && !crm?.connected;

  // Sampled sources report connected:true, so this stays truthy with nothing
  // connected — which is the point: the report always has something to show.
  const connected = data?.connected || ga4?.connected || gsc?.connected || crm?.connected;
  const topChannel = ga4?.channelBreakdown?.slice().sort((a, b) => b.sessions - a.sessions)[0];
  const maxPageViews = Math.max(...(ga4?.topPages?.map((p) => p.views) ?? [1]));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Reports</div>
          <p className="page-sub">
            {scope
              ? `${scope.type === "custom" ? "Custom report" : "Executive summary"} · generated from your connected platforms`
              : "Performance report generated from your connected platforms"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", cursor: "pointer" }}
          >
            {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button className="btn" onClick={() => window.print()} type="button">Print / PDF</button>
          <button className="btn btn-primary" onClick={() => { setEmailToTags(session?.user?.email ? [session.user.email] : []); setEmailToDraft(""); setEmailModal(true); }} disabled={sending} type="button">
            {sending ? "Sending…" : "Email report"}
          </button>
        </div>
      </div>

      {emailModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setEmailModal(false); }}
        >
          <div style={{ background: "var(--canvas)", borderRadius: 14, padding: 28, width: 420, maxWidth: "90vw", boxShadow: "0 8px 40px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Email report</h3>
              <button onClick={() => setEmailModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 20, lineHeight: 1, padding: 2 }} aria-label="Close">×</button>
            </div>

            {/* To — tag chip input */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                To<span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>
              </label>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", cursor: "text", minHeight: 40 }}
                onClick={(e) => { const inp = (e.currentTarget as HTMLDivElement).querySelector("input"); inp?.focus(); }}
              >
                {emailToTags.map((tag) => (
                  <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "2px 8px", borderRadius: 20, background: "var(--accent-100, #e0e7ff)", color: "var(--accent-700, #4338ca)", fontWeight: 500 }}>
                    {tag}
                    <button
                      onClick={() => setEmailToTags((prev) => prev.filter((t) => t !== tag))}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit", fontSize: 14, opacity: 0.7 }}
                      aria-label={`Remove ${tag}`}
                    >×</button>
                  </span>
                ))}
                <input
                  type="text"
                  value={emailToDraft}
                  onChange={(e) => setEmailToDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === ";") { e.preventDefault(); commitToTag(emailToDraft); }
                    if (e.key === "Backspace" && !emailToDraft && emailToTags.length) setEmailToTags((prev) => prev.slice(0, -1));
                  }}
                  onBlur={() => commitToTag(emailToDraft)}
                  placeholder={emailToTags.length ? "" : "email@example.com"}
                  style={{ flex: 1, minWidth: 140, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "var(--text-primary)", padding: "2px 2px" }}
                />
              </div>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>Press Enter or comma to add each address.</p>
            </div>
            {([   
              { label: "CC", value: emailCc, set: setEmailCc },
              { label: "BCC", value: emailBcc, set: setEmailBcc },
            ] as const).map(({ label, value, set }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>{label}</label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder="email@example.com, another@example.com"
                  style={{ fontSize: 13, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", outline: "none", width: "100%", boxSizing: "border-box" }}
                />
              </div>
            ))}
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Separate multiple addresses with commas or semicolons.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setEmailModal(false)} type="button">Cancel</button>
              <button className="btn btn-primary" onClick={sendReport} type="button">Send report</button>
            </div>
          </div>
        </div>
      )}

      {error ? (
        <NotConnected icon="⚠️" title="Couldn't load your report" body="Something went wrong reaching the server. Please refresh and try again." ctaHref="/reports" ctaLabel="Retry" />
      ) : loading ? (
        <SkeletonCard lines={8} />
      ) : !connected ? (
        <NotConnected
          icon="📄"
          title="Nothing to report yet"
          body="Connect a platform in Integrations to generate a real performance report from your live metrics."
        />
      ) : (
        <div ref={printRef} className="report-card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Sample figures must never appear unlabelled — see lib/api/sample.ts.
              Inside printRef so an exported PDF carries the disclosure too. */}
          {everythingIsMock && <SampleDataBanner platform="a platform" />}

          {/* Report header banner */}
          <div className="chart-card" style={{ background: "var(--accent-50, #f0f1ff)", borderColor: "var(--accent-200, #c7d2fe)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "var(--accent-600, #4f46e5)", textTransform: "uppercase", marginBottom: 4 }}>
                  {/* A saved report carries its own title; the standalone
                      document keeps the generic one. */}
                  {scope ? scope.name : "Marketing Performance Report"}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>{period}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{rangeLabel} · Generated {generatedAt}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Data sources</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {ga4?.connected && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, background: "#4285F4", color: "#fff", fontWeight: 600 }}>GA4</span>}
                  {gsc?.connected && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, background: "#34A853", color: "#fff", fontWeight: 600 }}>Search Console</span>}
                  {(data?.organicPlatforms?.length ?? 0) > 0 && <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, background: "#6366f1", color: "#fff", fontWeight: 600 }}>Social</span>}
                </div>
              </div>
            </div>
          </div>

          {/* The author's own summary leads a custom report. */}
          {scope?.customSummary?.trim() && (
            <div className="chart-card">
              <p style={{ fontSize: 14.5, lineHeight: 1.75, margin: 0 }}>{scope.customSummary}</p>
            </div>
          )}

          {/* KPI scorecard */}
          {kpis.length > 0 && (
            <div className={`chart-card${everythingIsMock ? " mock-wrap" : ""}`}>
              {everythingIsMock && <MockBadge />}
              <SectionHead title="Key Performance Indicators" sub={rangeLabel} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 12 }}>
                {kpis.slice(0, 8).map((k) => (
                  <div key={k.label} style={{ background: "var(--canvas)", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{k.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>{k.value}</div>
                    {k.delta && (
                      <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600, color: k.trend === "up" ? "#16a34a" : k.trend === "down" ? "#dc2626" : "var(--text-muted)" }}>
                        {k.trend === "up" ? "▲" : k.trend === "down" ? "▼" : "–"} {k.delta}
                      </div>
                    )}
                    {k.sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{k.sub}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* GA4 web analytics */}
            {/* Rendered even when unconnected: the card stays, showing real
                zeros and a marker, so the report keeps its full shape. */}
            {wants("organic") && ga4 && (
              <div className={`chart-card${ga4IsMock || ga4NeedsConnect ? " mock-wrap" : ""}`}>
                {ga4IsMock && <MockBadge />}
                {ga4NeedsConnect && <ConnectSourceBadge />}
                <SectionHead title="Website Analytics" sub="Google Analytics 4" />
                <MetricRow label="Total Sessions" value={fmt(ga4.totalSessions ?? 0)} />
                <MetricRow label="Total Users" value={fmt(ga4.totalUsers ?? 0)} />
                <MetricRow
                  label="New Users"
                  value={fmt(ga4.newUsers ?? 0)}
                  sub={ga4.totalUsers ? `${Math.round(((ga4.newUsers ?? 0) / ga4.totalUsers) * 100)}% of all` : undefined}
                />
                <MetricRow label="Event Count" value={fmt(ga4.eventCount ?? 0)} />
                <MetricRow label="Key Events" value={fmt(ga4.keyEvents ?? 0)} />
                <MetricRow
                  label="Avg. Engagement Time"
                  value={`${Math.floor((ga4.avgEngagementTime ?? 0) / 60)}m ${Math.round((ga4.avgEngagementTime ?? 0) % 60)}s`}
                />
                {topChannel && (
                  <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--canvas)", borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Top traffic channel</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{topChannel.channel}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmt(topChannel.sessions)} sessions · {fmt(topChannel.users)} users</div>
                  </div>
                )}
              </div>
            )}

            {/* Search Console */}
            {wants("organic") && gsc && (
              <div className={`chart-card${gscIsMock || gscNeedsConnect ? " mock-wrap" : ""}`}>
                {gscIsMock && <MockBadge />}
                {gscNeedsConnect && <ConnectSourceBadge />}
                <SectionHead title="Search Performance" sub="Google Search Console" />
                <MetricRow label="Total Clicks" value={fmt(gsc.clicks ?? 0)} />
                <MetricRow label="Total Impressions" value={fmt(gsc.impressions ?? 0)} />
                <MetricRow label="Avg. CTR" value={`${Number(gsc.ctr ?? 0).toFixed(1)}%`} />
                <MetricRow label="Avg. Position" value={gsc.avgPosition != null ? String(gsc.avgPosition) : "—"} sub="lower = better" />
                {gsc.siteUrl && (
                  <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--canvas)", borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Property</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", wordBreak: "break-all" }}>{gsc.siteUrl}</div>
                  </div>
                )}
              </div>
            )}

            {/* Traffic channel breakdown */}
            {(ga4?.channelBreakdown?.length ?? 0) > 0 && (
              <div className="chart-card">
                <SectionHead title="Traffic by Channel" sub="Sessions" />
                {ga4!.channelBreakdown!.slice(0, 7).map((ch) => (
                  <BarRow
                    key={ch.channel}
                    label={ch.channel}
                    value={ch.sessions}
                    max={ga4!.channelBreakdown![0].sessions}
                    color="#4285F4"
                  />
                ))}
              </div>
            )}

            {/* Top pages */}
            {(ga4?.topPages?.length ?? 0) > 0 && (
              <div className="chart-card">
                <SectionHead title="Top Pages by Views" />
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Page", "Views"].map((h) => (
                        <th key={h} style={{ padding: "5px 6px", textAlign: h === "Views" ? "right" : "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ga4!.topPages!.slice(0, 8).map((p, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 6px", color: "var(--text-primary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", color: "var(--text-muted)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                            <div style={{ width: 60, height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.round((p.views / maxPageViews) * 100)}%`, background: "#4285F4", borderRadius: 3 }} />
                            </div>
                            {fmt(p.views)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Top search queries */}
            {(gsc?.topQueries?.length ?? 0) > 0 && (
              <div className="chart-card">
                <SectionHead title="Top Search Queries" sub="by clicks" />
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Query", "Clicks", "CTR", "Pos."].map((h) => (
                        <th key={h} style={{ padding: "5px 6px", textAlign: h === "Query" ? "left" : "right", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gsc!.topQueries!.slice(0, 8).map((q, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 6px", color: "var(--text-primary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.query}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", color: "var(--text-muted)" }}>{fmt(q.clicks)}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", color: "var(--text-muted)" }}>{Number(q.ctr).toFixed(1)}%</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", color: "var(--text-muted)" }}>{Number(q.position).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Social platforms */}
            {(data?.organicPlatforms?.length ?? 0) > 0 && (
              <div className="chart-card">
                <SectionHead title="Social Platforms" sub="Organic performance" />
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Platform", "Followers", "Engagement", "Reach"].map((h) => (
                        <th key={h} style={{ padding: "5px 6px", textAlign: h === "Platform" ? "left" : "right", fontWeight: 600, color: "var(--text-muted)", fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data!.organicPlatforms.map((p) => (
                      <tr key={p.name} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 6px", color: "var(--text-primary)", fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", color: "var(--text-muted)" }}>{pickMetric(p, "Followers", "Fans", "Subscribers")}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", color: "var(--text-muted)" }}>{pickMetric(p, "Engagement")}</td>
                        <td style={{ padding: "7px 6px", textAlign: "right", color: "var(--text-muted)" }}>{pickMetric(p, "Reach", "Impressions", "Views")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Google platform cards (YouTube, etc.) */}
            {wants("organic") && (data?.googlePlatforms?.length ?? 0) > 0 && data!.googlePlatforms.map((gp) => (
              <div className="chart-card" key={gp.id}>
                <SectionHead title={gp.name} />
                {gp.metrics.map((m) => (
                  <MetricRow key={m.label} label={m.label} value={m.value} />
                ))}
              </div>
            ))}
          </div>

          {/* CRM & Leads */}
          {wants("leads") && crm && (
            <div className={`chart-card${crmIsMock || crmNeedsConnect ? " mock-wrap" : ""}`}>
              {crmIsMock && <MockBadge />}
              {crmNeedsConnect && <ConnectSourceBadge />}
              <SectionHead title="CRM & Leads" sub="HubSpot" />
              <MetricRow label="Total Contacts" value={fmt(crm.totalContacts ?? 0)} />
              <MetricRow label="New Leads (7d)" value={fmt(crm.leads ?? 0)} />
              <MetricRow label="Total Deals" value={fmt(crm.totalDeals ?? 0)} sub={`${crm.openDeals ?? 0} open · ${crm.wonDeals ?? 0} won · ${crm.lostDeals ?? 0} lost`} />
              <MetricRow label="Pipeline Value" value={`$${fmt(crm.pipeline ?? 0)}`} />
              <MetricRow label="Revenue (Closed Won)" value={`$${fmt(crm.revenue ?? 0)}`} />
              <MetricRow label="Win Rate" value={`${crm.winRate ?? 0}%`} />
              {(crm.stages?.length ?? 0) > 0 && (
                <>
                  <div style={{ marginTop: 14, marginBottom: 6, fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Deals by Stage</div>
                  {crm.stages!.map((s) => (
                    <BarRow
                      key={s.label}
                      label={s.label}
                      value={s.count}
                      max={Math.max(...crm.stages!.map((x) => x.count), 1)}
                      color="var(--accent-500, #6366f1)"
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {/* AI Insights & Recommendations */}
          {insights.length > 0 && (
            <div className="chart-card">
              <SectionHead title="AI Insights & Recommendations" sub={`${insights.length} active signals`} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                {insights.slice(0, 6).map((ins) => (
                  <div
                    key={ins.id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 10,
                      background: "var(--canvas)",
                      borderLeft: `3px solid ${ins.status === "attention" ? "#f59e0b" : ins.status === "decision" ? "#6366f1" : "#22c55e"}`,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5, color: ins.status === "attention" ? "#f59e0b" : ins.status === "decision" ? "#6366f1" : "#22c55e" }}>
                      {ins.status}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4, marginBottom: 4 }}>{ins.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{ins.meta}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Marketing Team Timesheet — only rendered when data exists */}
          {!scope && (tsLoading || tsRows.length > 0) && (
          <div className="chart-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <SectionHead title="Marketing Team Timesheet" sub="QuikProject · Marketing team only" />
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {TIMESHEET_VIEWS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setTsView(v.value)}
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                      background: tsView === v.value ? "var(--accent-600, #4f46e5)" : "var(--surface)",
                      color: tsView === v.value ? "#fff" : "var(--text-secondary)",
                      fontWeight: tsView === v.value ? 700 : 400,
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            {tsLoading ? (
              <SkeletonCard lines={4} />
            ) : tsRows.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                No timesheet data found for this period.
              </div>
            ) : (() => {
              const TARGET = tsView === "daily" ? 8 : tsView === "weekly" ? 40 : 160;
              const TARGET_LABEL = tsView === "daily" ? "8h/day" : tsView === "weekly" ? "40h/wk" : "160h/mo";
              const periodKey = tsView === "daily" ? "date" : tsView === "weekly" ? "week" : "month";

              // Periods per member
              const memberPeriods: Record<string, Record<string, number>> = {};
              for (const r of tsRows) {
                const period = (r as any)[periodKey] ?? r.date;
                memberPeriods[r.user] ??= {};
                memberPeriods[r.user][period] = (memberPeriods[r.user][period] ?? 0) + r.hours;
              }

              const members = Object.entries(memberPeriods)
                .map(([name, periods]) => {
                  const avatar = tsRows.find((r) => r.user === name)?.avatar ?? name.slice(0, 2).toUpperCase();
                  const totalHrs = Object.values(periods).reduce((s, h) => s + h, 0);
                  const periodCount = Object.keys(periods).length;
                  const avgHrs = periodCount > 0 ? totalHrs / periodCount : 0;
                  const met = avgHrs >= TARGET;
                  return { name, avatar, totalHrs, periodCount, avgHrs, met };
                })
                .sort((a, b) => b.totalHrs - a.totalHrs);

              const totalHrs = members.reduce((s, m) => s + m.totalHrs, 0);
              const metCount = members.filter((m) => m.met).length;

              return (
                <>
                  <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
                    {[
                      { label: "Total Hours", value: totalHrs.toFixed(1) },
                      { label: "Members", value: String(members.length) },
                      { label: `On target (${TARGET_LABEL})`, value: `${metCount} / ${members.length}` },
                    ].map((s) => (
                      <div key={s.label} style={{ background: "var(--canvas)", borderRadius: 8, padding: "10px 16px", minWidth: 110 }}>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--border)" }}>
                        {["Member", `${tsView === "daily" ? "Days" : tsView === "weekly" ? "Weeks" : "Months"} logged`, "Total hrs", `Avg / ${tsView === "daily" ? "day" : tsView === "weekly" ? "week" : "month"}`, `Target (${TARGET_LABEL})`].map((h) => (
                          <th key={h} style={{ padding: "7px 10px", textAlign: h === "Member" ? "left" : "center", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.name} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "9px 10px", fontWeight: 600, color: "var(--text-primary)" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#6366f1", color: "#fff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                {m.avatar}
                              </span>
                              {m.name}
                            </span>
                          </td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--text-secondary)" }}>{m.periodCount}</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", fontWeight: 700, color: "var(--text-primary)" }}>{m.totalHrs.toFixed(1)}h</td>
                          <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--text-secondary)" }}>{m.avgHrs.toFixed(1)}h</td>
                          <td style={{ padding: "9px 10px", textAlign: "center" }}>
                            <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700, background: m.met ? "#dcfce7" : "#fee2e2", color: m.met ? "#16a34a" : "#dc2626" }}>
                              {m.met ? `✓ Met` : `✗ ${(TARGET - m.avgHrs).toFixed(1)}h short`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              );
            })()}
          </div>
          )}

          {/* Footer */}
          <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "8px 0 4px" }}>
            Generated {generatedAt} · QuikInsight AI Growth OS
          </div>
        </div>
      )}
    </div>
  );
}
