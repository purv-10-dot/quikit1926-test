"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getOverviewData, type OverviewData } from "@/lib/api/overview";
import { hasAnyConnection } from "@/lib/api/sample";
import SampleDataBanner from "@/components/ui/SampleDataBanner";
import ConnectSourcePrompt from "@/components/ui/ConnectSourcePrompt";
import MockBadge from "@/components/ui/MockBadge";
import { getRecommendations, getActivity } from "@/lib/api/insights";
import { getConnectors } from "@/lib/api/connectors";
import type { Connector } from "@/types";
import { useOverviewFilters } from "@/store/useOverviewFilters";
import PeriodPicker from "@/components/ui/PeriodPicker";
import { resolvePeriod, windowToDays } from "@/lib/period/resolve";
import Kpi from "@/components/ui/Kpi";
import DoughnutGauge from "@/components/charts/DoughnutGauge";
import LineAreaChart from "@/components/charts/LineAreaChart";
import BarChartSimple from "@/components/charts/BarChartSimple";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";
import NotConnected from "@/components/ui/NotConnected";
import type { Recommendation } from "@/types";
import {
  ACTIVITY_FALLBACK, BUDGET_PACING, CAMPAIGNS, CHANNELS, DAILY_BRIEF, BRIEF_ACTION_QUESTION,
  EMAIL_CAMPAIGNS, EMAIL_CONNECTOR_IDS, EMAIL_OPEN_BY_DAY, EMAIL_SENDS_TREND, EMAIL_STATS,
  ENGAGEMENT_BY_DAY, HEALTH_SCORE, KPI_BASE, LEAD_FUNNEL, LEADS_BY_DAY, ORGANIC_PLATFORMS,
  PIPELINE_TREND, rangeMultiplier, mockDeltaLabel, RECOMMENDATIONS_FALLBACK, WEEK_LABELS, FOLLOWER_TREND,
  type PerformanceView,
} from "@/lib/mock/overviewPreview";

/**
 * Dashboard — ported from the v15 UI preview.
 *
 * MOCK DATA IS PER-SECTION, NOT PER-PAGE.
 *
 * Every section answers for itself: if its source is connected it shows real
 * data, otherwise it keeps the preview's sample figures and carries a "Mock"
 * stamp. So the dashboard is fully populated on day one and converts to real
 * numbers a source at a time as the workspace is onboarded — it never
 * half-empties the moment the first integration lands.
 *
 * That mix is only safe because EVERY sampled section is stamped. If you add a
 * section here, give it a `mock` flag and a <MockBadge /> in the same change —
 * an unstamped fabricated number sitting beside a real one is how an invented
 * figure ends up in a client report.
 *
 * Sections with a live source today: the KPI strip, AI recommendations, the
 * activity feed, and the Email Marketing card. Everything else (health score,
 * daily brief, channel glance, charts, lead funnel, budget pacing, campaigns)
 * has no endpoint yet and is always stamped.
 */
function displayFirstName(name?: string | null, email?: string | null): string {
  const n = (name ?? "").trim();
  if (n) return n.split(" ")[0];
  const local = (email ?? "").split("@")[0].split(/[._-]+/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}

const SEGMENTS: { key: PerformanceView; label: string }[] = [
  { key: "all", label: "All performance" },
  { key: "paid", label: "Paid Ads" },
  { key: "organic", label: "Organic Social" },
  { key: "email", label: "Email" },
];

type SortKey = "name" | "channel" | "spend" | "pipeline" | "roas";

export default function OverviewPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { period, setPeriod } = useOverviewFilters();

  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [activity, setActivity] = useState<{ text: string; time: string }[]>([]);

  const [view, setView] = useState<PerformanceView>("all");
  const [briefOpen, setBriefOpen] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "pipeline", dir: -1 });
  /**
   * Sample mode is workspace-wide: on while NOTHING is connected, which is the
   * DEFAULT state for a new workspace. The first connection anywhere turns it
   * off and the page switches to real data. `null` = still deciding, so we show
   * skeletons rather than flashing demo figures before the answer arrives.
   */
  const [sampleMode, setSampleMode] = useState<boolean | null>(null);
  /** Channel / organic-platform chips. Empty = "all", as in the preview. */
  const [checkedChannels, setCheckedChannels] = useState<string[]>([]);
  const [checkedPlatforms, setCheckedPlatforms] = useState<string[]>([]);
  /** Live connector state — drives the Email Marketing card's two states. */
  const [connectors, setConnectors] = useState<Connector[]>([]);

  useEffect(() => {
    hasAnyConnection().then((any) => setSampleMode(!any)).catch(() => setSampleMode(true));
  }, []);

  useEffect(() => {
    setData(null); setError(false);
    getOverviewData(period).then(setData).catch(() => setError(true));
  }, [period]);

  useEffect(() => {
    getRecommendations().then(setRecommendations).catch(() => {});
    getActivity().then(setActivity).catch(() => {});
    getConnectors().then(setConnectors).catch(() => setConnectors([]));
  }, []);

  /** Email tools actually connected — real data, not the preview's. */
  const connectedEmailTools = connectors.filter(
    (c) => EMAIL_CONNECTOR_IDS.includes(c.id) && c.connected,
  );

  function toggleChannel(name: string) {
    setCheckedChannels((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
  }
  function togglePlatform(name: string) {
    setCheckedPlatforms((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  }

  const firstName = displayFirstName(session?.user?.name, session?.user?.email);
  // Mock figures scale with the resolved window length, so a custom range does
  // not silently render 30-day numbers.
  const resolvedPeriod = useMemo(() => resolvePeriod(period), [period]);
  const rangeDays = windowToDays(resolvedPeriod.current);
  const comparing = resolvedPeriod.previous !== null;
  const mult = rangeMultiplier(rangeDays);

  // ── DEMO: channel glance totals ────────────────────────────────────────────
  const glance = useMemo(() => {
    const paid = CHANNELS.filter((c) => c.type === "paid");
    const paidSpend = paid.reduce((s, c) => s + c.spend, 0);
    const paidPipeline = paid.reduce((s, c) => s + c.pipeline, 0);
    const platforms = Object.values(ORGANIC_PLATFORMS);
    return {
      paidPipeline: (paidPipeline / 1000).toFixed(2),
      paidRoas: (paidSpend ? paidPipeline / paidSpend : 0).toFixed(1),
      followers: (platforms.reduce((s, p) => s + p.followers, 0) / 1000).toFixed(1),
      engagement: (platforms.reduce((s, p) => s + p.engagement, 0) / platforms.length).toFixed(1),
      sends: (EMAIL_STATS.sends / 1000).toFixed(1),
    };
  }, []);

  // ── KPI strip. "all" prefers LIVE data; the other tabs are DEMO. ───────────
  /**
   * Mock deltas are part of the fabricated payload, so they follow the same
   * rule as live ones: shown only when the user actually asked for a
   * comparison, and hidden (rather than faked) when they didn't. Every surface
   * using these still carries <MockBadge />.
   */
  const cmp = (delta: string, trend: "up" | "down" | "flat") =>
    comparing ? { delta, trend } : { delta: "", trend: "flat" as const };

  const kpis = useMemo(() => {
    if (view === "organic") {
      // Chips narrow the totals; no selection means all platforms.
      const keys = checkedPlatforms.length ? checkedPlatforms : Object.keys(ORGANIC_PLATFORMS);
      const platforms = keys.map((k) => ORGANIC_PLATFORMS[k]).filter(Boolean);
      const followers = platforms.reduce((s, p) => s + p.followers, 0);
      const reach = platforms.reduce((s, p) => s + p.reach, 0);
      const eng = platforms.reduce((s, p) => s + p.engagement, 0) / platforms.length;
      const content = CHANNELS.find((c) => c.name === "Content");
      return [
        { label: "Followers", value: `${(followers / 1000).toFixed(1)}K`, ...cmp("▲ 3.2%", "up"), sub: comparing ? "vs. last period" : "" },
        { label: "Engagement rate", value: `${eng.toFixed(1)}%`, ...cmp("▲ 0.8pt", "up"), sub: "above industry avg" },
        { label: "Organic reach", value: `${Math.round(reach / 1000)}K`, ...cmp("▼ 3.1%", "down"), sub: "seasonal dip" },
        { label: "Content pipeline", value: `$${(((content?.pipeline ?? 0) * mult) / 1000).toFixed(2)}M`, ...cmp("▲ 22%", "up"), sub: "AI-attributed" },
      ];
    }
    if (view === "paid") {
      const paidAll = CHANNELS.filter((c) => c.type === "paid");
      const paid = checkedChannels.length
        ? paidAll.filter((c) => checkedChannels.includes(String(c.name)))
        : paidAll;
      const spend = paid.reduce((s, c) => s + c.spend, 0) * mult;
      const pipeline = paid.reduce((s, c) => s + c.pipeline, 0) * mult;
      return [
        { label: "Paid pipeline", value: `$${(pipeline / 1000).toFixed(2)}M`, ...cmp("▲ 11%", "up"), sub: comparing ? "vs. last period" : "" },
        { label: "Paid spend", value: `$${(spend / 1000).toFixed(2)}M`, ...cmp("▲ 9%", "flat"), sub: "of monthly budget" },
        { label: "CAC", value: `$${Math.round(KPI_BASE.cac)}`, ...cmp("▼ 8%", "down"), sub: "AI-flagged this week" },
        { label: "ROAS", value: `${(spend ? pipeline / spend : 0).toFixed(1)}x`, ...cmp("—", "flat"), sub: "vs. planned 4.0x" },
      ];
    }
    if (view === "email") {
      return [
        { label: "Emails sent", value: `${((EMAIL_STATS.sends * mult) / 1000).toFixed(1)}K`, ...cmp("▲ 9%", "up"), sub: comparing ? "vs. last period" : "" },
        { label: "Open rate", value: `${EMAIL_STATS.openRate.toFixed(1)}%`, ...cmp("▲ 1.2pt", "up"), sub: "above industry avg" },
        { label: "Click rate", value: `${EMAIL_STATS.clickRate.toFixed(1)}%`, ...cmp("▲ 0.4pt", "up"), sub: comparing ? "vs. last period" : "" },
        { label: "Email pipeline", value: `$${(EMAIL_STATS.pipeline * mult).toFixed(2)}M`, ...cmp("▲ 15%", "up"), sub: "AI-attributed" },
      ];
    }
    // LIVE when the API returned KPIs. The preview's numbers fill in only while
    // sampling — once anything is connected, real-but-empty stays empty.
    // Live KPIs are org-wide totals with no per-channel breakdown, so the chips
    // cannot narrow them; they still filter the campaigns table below.
    if (data?.kpis?.length) return data.kpis;

    // Chips drive these totals. The preview left the "All" tab's KPIs fixed,
    // which made the chips look broken — clicking one changed nothing above the
    // fold. Deriving the numbers from the selected channels makes the filter
    // visibly do something, and keeps Pipeline/Revenue/ROAS internally
    // consistent with the campaigns table underneath.
    // One filter rather than a ternary: mixing the readonly CHANNELS tuple with
    // a filtered array widens the element type and breaks reduce() inference.
    const selected = CHANNELS.filter(
      (c) => checkedChannels.length === 0 || checkedChannels.includes(String(c.name)),
    );
    const totalPipeline = CHANNELS.reduce((s, c) => s + c.pipeline, 0);
    const selPipeline = selected.reduce((s, c) => s + c.pipeline, 0);
    const selSpend = selected.reduce((s, c) => s + c.spend, 0);
    const share = totalPipeline ? selPipeline / totalPipeline : 1;
    const filtered = selected.length !== CHANNELS.length;
    // Names the active chips when filtered; otherwise only claims a comparison
    // if one was actually requested.
    const scope = filtered
      ? selected.map((c) => c.name).join(", ")
      : comparing ? "vs. last period" : "";

    return [
      { label: "Pipeline", value: `$${((selPipeline * mult) / 1000).toFixed(2)}M`, ...cmp("▲ 14%", "up"), sub: scope },
      { label: "Revenue", value: `$${(KPI_BASE.revenue * share * mult).toFixed(2)}M`, ...cmp("▲ 6%", "up"), sub: "of quarterly target" },
      { label: "CAC", value: `$${Math.round(KPI_BASE.cac)}`, ...cmp("▼ 8%", "down"), sub: "AI-flagged this week" },
      { label: "ROAS", value: `${(selSpend ? selPipeline / selSpend : 0).toFixed(1)}x`, ...cmp("—", "flat"), sub: "vs. planned 4.0x" },
    ];
  }, [view, mult, comparing, data, checkedPlatforms, checkedChannels]);

  /**
   * Both trend charts carry a pill: chart A a growth % over the 6-week series,
   * chart B the best-performing weekday. Computed, not hardcoded, so they stay
   * truthful when the underlying series is swapped for a real one.
   */
  const charts = useMemo(() => {
    const growth = (series: number[]) =>
      series[0] ? Math.round(((series[series.length - 1] - series[0]) / series[0]) * 100) : 0;
    const bestDay = (byDay: Record<string, number>) =>
      Object.entries(byDay).reduce((best, e) => (e[1] > best[1] ? e : best))[0];

    if (view === "organic") {
      const scaled = FOLLOWER_TREND.map((v) => v);
      return {
        aTitle: "Follower growth", aSub: "Last 6 weeks", aPill: `+${growth(scaled)}%`, aPillTone: "green" as const,
        a: <LineAreaChart labels={WEEK_LABELS} data={scaled} valueSuffix="K" />,
        bTitle: "Engagement by day", bSub: "This week", bPill: `Best: ${bestDay(ENGAGEMENT_BY_DAY)}`, bPillTone: "neutral" as const,
        b: <BarChartSimple labels={Object.keys(ENGAGEMENT_BY_DAY)} data={Object.values(ENGAGEMENT_BY_DAY)} />,
      };
    }
    if (view === "email") {
      return {
        aTitle: "Email sends trend", aSub: "Last 6 weeks", aPill: `+${growth(EMAIL_SENDS_TREND)}%`, aPillTone: "green" as const,
        a: <LineAreaChart labels={WEEK_LABELS} data={EMAIL_SENDS_TREND} color="#DC2626" valueSuffix="K" />,
        bTitle: "Open rate by day", bSub: "This week", bPill: `Best: ${bestDay(EMAIL_OPEN_BY_DAY)}`, bPillTone: "neutral" as const,
        b: <BarChartSimple labels={Object.keys(EMAIL_OPEN_BY_DAY)} data={Object.values(EMAIL_OPEN_BY_DAY)} />,
      };
    }
    // Both series scale with the channel chips as well as the range, so the
    // charts move when the filter changes instead of sitting static.
    // One filter rather than a ternary: mixing the readonly CHANNELS tuple with
    // a filtered array widens the element type and breaks reduce() inference.
    const selected = CHANNELS.filter(
      (c) => checkedChannels.length === 0 || checkedChannels.includes(String(c.name)),
    );
    const totalPipeline = CHANNELS.reduce((s, c) => s + c.pipeline, 0);
    const share = totalPipeline
      ? selected.reduce((s, c) => s + c.pipeline, 0) / totalPipeline
      : 1;
    const leadsScaled = Object.fromEntries(
      Object.entries(LEADS_BY_DAY).map(([d, v]) => [d, Math.round(v * mult * share)]),
    ) as Record<string, number>;
    const pipelineScaled = PIPELINE_TREND.map((v) => v * mult * share);
    return {
      aTitle: "Pipeline growth", aSub: "Last 6 weeks", aPill: `+${growth(pipelineScaled)}%`, aPillTone: "green" as const,
      a: <LineAreaChart labels={WEEK_LABELS} data={pipelineScaled} valuePrefix="$" valueSuffix="M" />,
      bTitle: "Leads by day", bSub: "This week", bPill: `Best: ${bestDay(leadsScaled)}`, bPillTone: "neutral" as const,
      b: <BarChartSimple labels={Object.keys(leadsScaled)} data={Object.values(leadsScaled)} />,
    };
  }, [view, mult, checkedChannels]);

  /**
   * Campaigns respect the channel chips AND the sort. Empty chip selection
   * means "all channels", matching the preview — an empty filter shows
   * everything rather than nothing.
   */
  const sortedCampaigns = useMemo(() => {
    const active = checkedChannels.length ? checkedChannels : CHANNELS.map((c) => String(c.name));
    const rows = CAMPAIGNS.filter((c) => active.includes(c.channel));
    rows.sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (typeof x === "number" && typeof y === "number") return (x - y) * sort.dir;
      return String(x).localeCompare(String(y)) * sort.dir;
    });
    return rows;
  }, [sort, checkedChannels]);

  function toggleSort(key: SortKey) {
    setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }));
  }

  // Live wins; the preview's cards fill in ONLY while sampling. Once anything
  // is connected an empty list stays empty rather than reverting to demo copy.
  const recoCards = recommendations.length
    ? recommendations.map((r, i) => ({
        id: String(i),
        label: r.label ?? "",
        body: r.body ?? "",
        suggestedQuestion: r.suggestedQuestion ?? r.label ?? "",
      }))
    : RECOMMENDATIONS_FALLBACK;

  const activityRows = activity.length
    ? activity.map((a, i) => ({ ...a, icon: ACTIVITY_FALLBACK[i % ACTIVITY_FALLBACK.length].icon, color: ACTIVITY_FALLBACK[i % ACTIVITY_FALLBACK.length].color }))
    : ACTIVITY_FALLBACK;

  const funnelMax = LEAD_FUNNEL[0]?.value || 1;

  /**
   * Per-section mock flags. `true` = this section is showing sample figures and
   * must render a <MockBadge />. Sections with no endpoint at all are hard-coded
   * true rather than derived, so they stay stamped until someone wires a real
   * source and consciously flips them.
   */
  const kpisAreMock = !(data?.kpis?.length);
  const recoAreMock = recommendations.length === 0;
  const activityIsMock = activity.length === 0;
  const NO_SOURCE_YET = true; // health score, brief, glance, charts, funnel, budget, campaigns

  return (
    <div>
      <div className="greet-row">
        <div>
          <h1 className="greeting">Good morning, {firstName} 👋</h1>
          <p className="page-sub">Here&apos;s how marketing is performing today</p>
        </div>
        <div className="greet-actions">
          <button className="btn" onClick={() => router.push("/ask-ai")} type="button">✦ Ask AI</button>
          <button className="btn btn-primary" onClick={() => router.push("/reports")} type="button">+ New report</button>
        </div>
      </div>

      {error ? (
        <NotConnected icon="⚠️" title="Couldn't load your overview" body="Something went wrong reaching the server. Please refresh and try again." ctaHref="/overview" ctaLabel="Retry" />
      ) : !data || sampleMode === null ? (
        <>
          <SkeletonKpiStrip />
          <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
        </>
      ) : (
        // No "nothing connected" empty state here by design: an un-configured
        // workspace gets the full dashboard on sample data instead, so the
        // product demonstrates itself before any OAuth is done. The banner and
        // the connect prompt carry the disclosure.
        <>
          {sampleMode && <SampleDataBanner platform="a data source" href="/integrations" />}
          {/* Sections carry their own stamp; this banner is the page-level
              summary shown only while the workspace has nothing connected. */}
          <ConnectSourcePrompt open={sampleMode === true} />
          {/* Channel glance — no per-channel API yet, always sampled. */}
          <div className="reco-head" style={{ margin: "6px 0 12px" }}>
            <h3>Marketing channels at a glance</h3>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Paid, organic &amp; email — click a card</span>
          </div>
          <div className="grid-3" style={{ marginBottom: 18 }}>
            <GlanceCard color="#6C5CE0" label="Paid Ads" onClick={() => setView("paid")}
              metrics={[["Pipeline", `$${glance.paidPipeline}M`], ["ROAS", `${glance.paidRoas}x`]]} />
            <GlanceCard color="#16A34A" label="Organic Social" onClick={() => setView("organic")}
              metrics={[["Followers", `${glance.followers}K`], ["Engagement", `${glance.engagement}%`]]} />
            <GlanceCard color="#E8A33D" label="Email Marketing" onClick={() => setView("email")}
              metrics={[["Emails sent", `${glance.sends}K`], ["Open rate", `${EMAIL_STATS.openRate.toFixed(1)}%`]]} />
          </div>

          {/* Email Marketing — the ONE card driven by real connector state even
              while sampling: it either confirms a live sync or offers to start
              one, so the path to connecting something is always honest. */}
          {connectedEmailTools.length > 0 ? (
            <div className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>Email Marketing</h3>
                <span className="pill pill-green">
                  Synced from {connectedEmailTools.map((c) => c.name).join(" & ")}
                </span>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "2px 0 14px" }}>
                Live send, open, and click performance from your connected email tool.
              </p>
              <div className="grid-3">
                <KpiMini label="Emails sent" value={`${(EMAIL_STATS.sends / 1000).toFixed(1)}K`} />
                <KpiMini label="Open rate" value={`${EMAIL_STATS.openRate.toFixed(1)}%`} />
                <KpiMini label="Click rate" value={`${EMAIL_STATS.clickRate.toFixed(1)}%`} />
              </div>
            </div>
          ) : (
            <div className="card mock-wrap" style={{ marginBottom: 18, borderColor: "#E8A33D" }}>
              <MockBadge />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>Email Marketing</h3>
              </div>
              <p style={{ fontSize: 12.5,  color: "var(--text-secondary)", margin: "2px 0 14px" }}>
                This is sample data. Connect an email marketing tool to sync real send, open, and
                click performance automatically.
              </p>
              <div className="grid-3" style={{ marginBottom: 14 }}>
                <KpiMini label="Emails sent" value={`${(EMAIL_STATS.sends / 1000).toFixed(1)}K`} />
                <KpiMini label="Open rate" value={`${EMAIL_STATS.openRate.toFixed(1)}%`} />
                <KpiMini label="Click rate" value={`${EMAIL_STATS.clickRate.toFixed(1)}%`} />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {EMAIL_CONNECTOR_IDS.map((id) => {
                  const c = connectors.find((x) => x.id === id);
                  if (!c) return null;
                  return (
                    <button
                      key={id}
                      className="btn btn-sm btn-primary"
                      type="button"
                      onClick={() => router.push("/integrations")}
                    >
                      Connect {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* DEMO — health score gauge + AI daily brief */}
          <div className="grid-2">
            <div className={`card gauge-card${NO_SOURCE_YET ? " mock-wrap" : ""}`}>
              {NO_SOURCE_YET && <MockBadge />}
              <div className="gauge-wrap">
                <DoughnutGauge value={HEALTH_SCORE.value} />
                <div className="gauge-center">
                  <span className="gauge-score">{HEALTH_SCORE.value}</span>
                  <span className="gauge-max">/100</span>
                </div>
              </div>
              <div>
                <p className="gauge-label">Marketing health score</p>
                <p className="gauge-rating">Rated <b>{HEALTH_SCORE.rating}</b></p>
                <span className="pill pill-green">{HEALTH_SCORE.delta}</span>
              </div>
            </div>

            {briefOpen && (
              <div className={`card brief-card${NO_SOURCE_YET ? " mock-wrap" : ""}`}>
                {NO_SOURCE_YET && <MockBadge />}
                <div className="brief-head">
                  <span className="brief-icon">✦</span>
                  <span className="brief-label">AI DAILY BRIEF</span>
                  <span className="brief-dot" />
                </div>
                <ul className="brief-list">
                  {DAILY_BRIEF.map((b) => <li key={b}>{b}</li>)}
                </ul>
                <div className="brief-actions">
                  <button className="btn btn-primary btn-sm" type="button"
                    onClick={() => router.push(`/ask-ai?q=${encodeURIComponent(BRIEF_ACTION_QUESTION)}`)}>
                    Act on brief →
                  </button>
                  <button className="btn btn-sm" type="button" onClick={() => setBriefOpen(false)}>Dismiss</button>
                </div>
              </div>
            )}
          </div>

          <div className="seg-control">
            {SEGMENTS.map((s) => (
              <button key={s.key} type="button"
                className={`seg-btn${view === s.key ? " active" : ""}`}
                onClick={() => setView(s.key)}>
                {s.label}
              </button>
            ))}
          </div>

          {kpis.length > 0 && (
          <div className={`kpi-strip${kpisAreMock ? " mock-wrap" : ""}`}>
            {kpisAreMock && <MockBadge />}
            {kpis.map((k) => (
              <Kpi key={k.label} label={k.label} value={k.value} delta={k.delta} trend={k.trend} sub={k.sub} comparison={k.comparison} />
            ))}
          </div>
          )}

          {/* Filter chips + range, one row. Which chips appear depends on the
              active segment, exactly as in the preview. */}
          <div className="filter-row">
            {view === "organic" &&
              Object.keys(ORGANIC_PLATFORMS).map((pf) => (
                <button
                  key={pf}
                  type="button"
                  className={`chip${checkedPlatforms.includes(pf) ? " active" : ""}`}
                  onClick={() => togglePlatform(pf)}
                >
                  {pf}
                </button>
              ))}
            {view === "email" && (
              <span className="chip active" style={{ cursor: "default" }}>Email</span>
            )}
            {(view === "all" || view === "paid") &&
              CHANNELS.filter((c) => view === "all" || c.type === "paid").map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className={`chip${checkedChannels.includes(String(c.name)) ? " active" : ""}`}
                  onClick={() => toggleChannel(String(c.name))}
                >
                  {c.name}
                </button>
              ))}
            {(checkedChannels.length > 0 || checkedPlatforms.length > 0) && (
              <button
                type="button"
                className="chip"
                onClick={() => { setCheckedChannels([]); setCheckedPlatforms([]); }}
                title="Show all channels"
              >
                ✕ Clear
              </button>
            )}
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>

          <div className="grid-2">
            <div className={`chart-card${NO_SOURCE_YET ? " mock-wrap" : ""}`}>
              {NO_SOURCE_YET && <MockBadge />}
              <div className="chart-head">
                <h3>{charts.aTitle}</h3>
                <span className={`pill pill-${charts.aPillTone}`}>{charts.aPill}</span>
              </div>
              <p className="chart-sub">{charts.aSub}</p>
              <div style={{ position: "relative", height: 220 }}>{charts.a}</div>
            </div>
            <div className={`chart-card${NO_SOURCE_YET ? " mock-wrap" : ""}`}>
              {NO_SOURCE_YET && <MockBadge />}
              <div className="chart-head">
                <h3>{charts.bTitle}</h3>
                <span className={`pill pill-${charts.bPillTone}`}>{charts.bPill}</span>
              </div>
              <p className="chart-sub">{charts.bSub}</p>
              <div style={{ position: "relative", height: 220 }}>{charts.b}</div>
            </div>
          </div>

          {recoCards.length > 0 && (<>
          <div className="reco-head">
            <h3>AI recommendations</h3>
            <a className="link" onClick={() => router.push("/insights")}>View all →</a>
          </div>
          <div className={`grid-3${recoAreMock ? " mock-wrap" : ""}`} style={{ marginBottom: 18 }}>
            {recoAreMock && <MockBadge />}
            {recoCards.map((r) => (
              <div className="reco-card" key={r.id}>
                <div className="reco-icon">✦</div>
                <p className="reco-label">{r.label}</p>
                <p className="reco-body">{r.body}</p>
                <a className="link" onClick={() => router.push(`/ask-ai?q=${encodeURIComponent(r.suggestedQuestion)}`)}>
                  Ask AI about this →
                </a>
              </div>
            ))}
          </div>
          </>)}

          {/* Lead funnel + budget pacing — no endpoint yet, always sampled. */}
          <div className="grid-2">
            <div className={`chart-card${NO_SOURCE_YET ? " mock-wrap" : ""}`}>
              {NO_SOURCE_YET && <MockBadge />}
              <div className="chart-head"><h3>Lead funnel</h3></div>
              <p className="chart-sub">This period</p>
              <div>
                {LEAD_FUNNEL.map((s, i) => {
                  const shades = ["22", "55", "99", "CC", ""];
                  return (
                    <div className="funnel-row" key={s.label}>
                      <div className="funnel-stage-label">{s.label}</div>
                      <div className="funnel-bar"
                        style={{
                          width: `${Math.max(16, (s.value / funnelMax) * 100)}%`,
                          background: `#6C5CE0${shades[i] ?? ""}`,
                          color: i >= 2 ? "#fff" : "#5445D6",
                        }}>
                        <span>{s.value.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className={`chart-card${NO_SOURCE_YET ? " mock-wrap" : ""}`}>
              {NO_SOURCE_YET && <MockBadge />}
              <div className="chart-head"><h3>Budget pacing</h3></div>
              <p className="chart-sub">This month</p>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ position: "relative", height: 150, width: 150 }}>
                  <DoughnutGauge value={BUDGET_PACING.percent} trackColor="#DBDAD3" fullRing={false} />
                </div>
                <div className="donut-legend">
                  <div className="donut-legend-item">
                    <span className="donut-legend-dot" style={{ background: "var(--accent)" }} />
                    Spent — {BUDGET_PACING.spent}
                  </div>
                  <div className="donut-legend-item">
                    <span className="donut-legend-dot" style={{ background: "var(--bar-gray)" }} />
                    Remaining — {BUDGET_PACING.remaining}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{BUDGET_PACING.caption}</div>
                </div>
              </div>
            </div>
          </div>

          {/* DEMO — campaigns */}
          <div className={`chart-card${NO_SOURCE_YET ? " mock-wrap" : ""}`} style={{ marginTop: 16 }}>
            {NO_SOURCE_YET && <MockBadge />}
            <div className="chart-head">
              <h3>Campaigns</h3>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>click a column to sort</span>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    {([["name", "Campaign"], ["channel", "Channel"], ["spend", "Spend"], ["pipeline", "Pipeline"], ["roas", "ROAS"]] as [SortKey, string][]).map(([key, label]) => (
                      <th key={key} onClick={() => toggleSort(key)} style={{ cursor: "pointer" }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCampaigns.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.channel}</td>
                      <td>${c.spend}K</td>
                      <td>${c.pipeline}K</td>
                      <td>{c.roas.toFixed(1)}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* DEMO — email campaign table, Email tab only */}
          {view === "email" && (
            <div className="chart-card mock-wrap" style={{ marginTop: 16 }}>
              <MockBadge />
              <div className="chart-head"><h3>Email campaign performance</h3></div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Campaign</th><th>Sends</th><th>Open rate</th><th>Click rate</th></tr></thead>
                  <tbody>
                    {EMAIL_CAMPAIGNS.map((e) => (
                      <tr key={e.name}>
                        <td>{e.name}</td>
                        <td>{e.sends.toLocaleString()}</td>
                        <td>{e.openRate.toFixed(1)}%</td>
                        <td>{e.clickRate.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activityRows.length > 0 && (
          <div className={`chart-card${activityIsMock ? " mock-wrap" : ""}`} style={{ marginTop: 16 }}>
            {activityIsMock && <MockBadge />}
            <div className="chart-head"><h3>Recent activity</h3></div>
            <div>
              {activityRows.map((a, i) => (
                <div className="alert-mini" key={i}>
                  <span className="activity-icon" style={{ background: a.color }}>{a.icon}</span>
                  <div style={{ flex: 1 }}>
                    <span>{a.text}</span>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}

function KpiMini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, margin: "0 0 4px" }}>
        {label}
      </p>
      <p style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{value}</p>
    </div>
  );
}

function GlanceCard({
  label, color, metrics, badge, onClick, mock = true,
}: {
  label: string; color: string; metrics: [string, string][]; badge?: string; onClick: () => void;
  /** Glance totals have no per-channel API yet, so these are sampled. */
  mock?: boolean;
}) {
  return (
    <div
      className={`card${mock ? " mock-wrap" : ""}`}
      onClick={onClick}
      style={{ cursor: "pointer", borderTop: `3px solid ${color}` }}
    >
      {mock && <MockBadge />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontWeight: 700, fontSize: 13.5, margin: 0 }}>{label}</p>
        {badge && <span className="pill pill-neutral">{badge}</span>}
      </div>
      {metrics.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
          <span style={{ color: "var(--text-secondary)" }}>{k}</span>
          <span style={{ fontWeight: 700 }}>{v}</span>
        </div>
      ))}
      <p className="link" style={{ margin: "10px 0 0", fontSize: 12.5 }}>View details →</p>
    </div>
  );
}
