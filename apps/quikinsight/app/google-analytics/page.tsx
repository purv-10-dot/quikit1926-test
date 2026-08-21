"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import SampleDataBanner from "@/components/ui/SampleDataBanner";
import MockBadge from "@/components/ui/MockBadge";
import { getGoogleAnalyticsData, type GoogleAnalyticsData } from "@/lib/api/google-analytics";
import Kpi from "@/components/ui/Kpi";
import LineAreaChart from "@/components/charts/LineAreaChart";
import BarChartSimple from "@/components/charts/BarChartSimple";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

/**
 * Google Analytics — layout ported from the v15 preview's platform-detail view
 * (PLATFORM_DETAILS.ga4): header + connection banner, a 4-card KPI strip, a
 * trend chart beside a channel breakdown, then a top-pages table.
 *
 * WIRED TO REAL DATA. Every card reads GoogleAnalyticsData from
 * /api/google-analytics. Where the preview showed a metric GA4 does not give us
 * per-row, the column is dropped rather than filled with an invented number —
 * see the table below. When the property is not connected, lib/api/sample.ts
 * substitutes GA4_SAMPLE and flags it, and the page carries the Mock stamp.
 *
 * Sections after the table (Top countries, Top events) are NOT in the preview.
 * They are backed by real API fields and predate this port, so they were kept
 * rather than deleted — deleting working, real-data sections was not part of a
 * layout change.
 */
const GA_BLUE = "#4285F4";
const GA_GREEN = "#34A853";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

/** GA4 daily keys arrive as YYYYMMDD or YYYY-MM-DD; render as DD/MM. */
function fmtDate(d: string): string {
  const digits = d.replace(/-/g, "");
  if (digits.length !== 8) return d;
  return `${digits.slice(6)}/${digits.slice(4, 6)}`;
}

function Header({ live }: { live?: number }) {
  return (
    <div className="page-head">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: GA_BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 192 192" fill="none">
            <path d="M150 24h-24a12 12 0 0 0-12 12v120a12 12 0 0 0 12 12h24a12 12 0 0 0 12-12V36a12 12 0 0 0-12-12Z" fill="#F9AB00" />
            <path d="M66 96H42a12 12 0 0 0-12 12v48a12 12 0 0 0 12 12h24a12 12 0 0 0 12-12v-48a12 12 0 0 0-12-12Z" fill="#E37400" />
            <circle cx="108" cy="144" r="24" fill="#E37400" />
          </svg>
        </div>
        <div>
          <div className="page-title">Google Analytics</div>
          <p className="page-sub">Website &amp; audience analytics</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
        {(live ?? 0) > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--green-soft)", borderRadius: 20, padding: "6px 14px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: GA_GREEN, display: "inline-block" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: GA_GREEN }}>{live} live right now</span>
          </span>
        )}
        <Link href="/integrations" className="btn">Manage in Integrations</Link>
      </div>
    </div>
  );
}

export default function GoogleAnalyticsPage() {
  const [data, setData] = useState<GoogleAnalyticsData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getGoogleAnalyticsData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <Header />
      <NotConnected icon="⚠️" title="Couldn't load GA4 data" body="Something went wrong. Please refresh and try again." ctaHref="/google-analytics" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <Header />
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  const mock = Boolean(data.isSampleData);
  const sessions = data.totalSessions ?? 0;
  const trend = data.dailyTrend ?? [];
  const channels = data.channelBreakdown ?? [];
  const pages = data.topPages ?? [];
  const countries = data.topCountries ?? [];
  const events = data.topEvents ?? [];

  // Conversion rate is derived, not returned: GA4 gives key events and sessions
  // separately. Guarded so an empty property shows "—" rather than NaN%.
  const conversionRate = sessions > 0 ? ((data.keyEvents ?? 0) / sessions) * 100 : null;

  return (
    <div>
      <Header live={data.realtime?.activeUsers} />

      {/* Connection banner — the preview's "synced / connect" strip. */}
      {mock ? (
        <SampleDataBanner platform="Google Analytics" />
      ) : (
        <div className="team-banner">
          <div className="team-synced-pill">
            <span className="platform-dot on" />
            Synced from Google Analytics
          </div>
          <Link href="/integrations" className="btn btn-sm">Manage connection</Link>
        </div>
      )}

      <div className={`kpi-strip${mock ? " mock-wrap" : ""}`}>
        {mock && <MockBadge />}
        <Kpi label="Sessions" value={fmt(sessions)} delta="" trend="flat" sub="vs. last period" />
        <Kpi label="Users" value={fmt(data.totalUsers ?? 0)} delta="" trend="flat" sub="unique visitors" />
        <Kpi label="Avg. session" value={fmtTime(data.avgEngagementTime ?? 0)} delta="" trend="flat" sub="engagement time" />
        <Kpi
          label="Conversion rate"
          value={conversionRate === null ? "—" : `${conversionRate.toFixed(1)}%`}
          delta=""
          trend="flat"
          sub="key events ÷ sessions"
        />
      </div>

      <div className="grid-2">
        <div className={`chart-card${mock ? " mock-wrap" : ""}`}>
          {mock && <MockBadge />}
          {/* The preview plotted "Sessions trend". GA4's daily series carries
              ACTIVE USERS, not sessions, so the title says what is actually
              plotted rather than inheriting the preview's label. */}
          <div className="chart-head"><h3>Active users trend</h3></div>
          <p className="chart-sub">Daily, current period</p>
          <div style={{ position: "relative", height: 200 }}>
            {trend.length > 0 ? (
              <LineAreaChart
                labels={trend.map((d) => fmtDate(d.date))}
                data={trend.map((d) => d.activeUsers)}
                color={GA_BLUE}
              />
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No daily data for this period.</p>
            )}
          </div>
        </div>

        <div className={`chart-card${mock ? " mock-wrap" : ""}`}>
          {mock && <MockBadge />}
          <div className="chart-head"><h3>Top channels by sessions</h3></div>
          <p className="chart-sub">This period</p>
          <div style={{ position: "relative", height: 200 }}>
            {channels.length > 0 ? (
              <BarChartSimple
                labels={channels.map((c) => c.channel)}
                data={channels.map((c) => c.sessions)}
                colors={GA_BLUE}
              />
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No channel data for this period.</p>
            )}
          </div>
        </div>
      </div>

      {/* Top landing pages. The preview's mock table also had Bounce rate and
          Conversions per page; GA4's topPages response carries neither, so
          those columns are omitted rather than filled with invented values. */}
      <div className={`chart-card${mock ? " mock-wrap" : ""}`} style={{ marginTop: 16 }}>
        {mock && <MockBadge />}
        <div className="chart-head"><h3>Top landing pages</h3></div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Page</th><th>Views</th></tr></thead>
            <tbody>
              {pages.length === 0 ? (
                <tr><td colSpan={2} style={{ color: "var(--text-muted)", padding: "16px 0" }}>No page data for this period.</td></tr>
              ) : (
                pages.map((p) => (
                  <tr key={p.title}>
                    <td>{p.title}</td>
                    <td>{p.views.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Beyond the preview: real GA4 fields kept from the previous page ── */}
      {(countries.length > 0 || events.length > 0) && (
        <div className="grid-2" style={{ marginTop: 16 }}>
          {countries.length > 0 && (
            <div className={`chart-card${mock ? " mock-wrap" : ""}`}>
              {mock && <MockBadge />}
              <div className="chart-head"><h3>Top countries</h3></div>
              <p className="chart-sub">By active users</p>
              <div style={{ position: "relative", height: 200 }}>
                <BarChartSimple
                  labels={countries.map((c) => c.country)}
                  data={countries.map((c) => c.activeUsers)}
                  colors={GA_BLUE}
                />
              </div>
            </div>
          )}
          {events.length > 0 && (
            <div className={`chart-card${mock ? " mock-wrap" : ""}`}>
              {mock && <MockBadge />}
              <div className="chart-head"><h3>Top events</h3></div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Event</th><th>Count</th></tr></thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.name}>
                        <td>{e.name}</td>
                        <td>{e.value.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
