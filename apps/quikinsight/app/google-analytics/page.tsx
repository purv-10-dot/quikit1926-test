"use client";
import { useEffect, useState } from "react";
import { getGoogleAnalyticsData, type GoogleAnalyticsData } from "@/lib/api/google-analytics";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

const GA_BLUE  = "#4285F4";
const GA_GREEN = "#34A853";
const GA_RED   = "#EA4335";
const GA_YELLOW = "#FBBC04";

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

function fmtDate(d: string): string {
  // Input is YYYYMMDD
  if (d.length !== 8) return d;
  return `${d.slice(6)}/${d.slice(4, 6)}`;
}

export default function GoogleAnalyticsPage() {
  const [data, setData] = useState<GoogleAnalyticsData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getGoogleAnalyticsData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <div className="page-head"><div><div className="page-title">Google Analytics 4</div><p className="page-sub">Website traffic & audience</p></div></div>
      <NotConnected icon="âš ï¸" title="Couldn't load GA4 data" body="Something went wrong. Please refresh and try again." ctaHref="/google-analytics" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head"><div><div className="page-title">Google Analytics 4</div><p className="page-sub">Website traffic & audience</p></div></div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head"><div><div className="page-title">Google Analytics 4</div><p className="page-sub">Website traffic & audience</p></div></div>
      <NotConnected
        icon="ðŸ“Š"
        title="Google Analytics 4 not connected"
        body="Connect your GA4 property to see sessions, users, page views, engagement time, and traffic source breakdowns."
        ctaHref="/integrations"
        ctaLabel="Connect Google Analytics 4"
      />
    </div>
  );

  const maxChannel = Math.max(...(data.channelBreakdown ?? []).map((c) => c.sessions), 1);
  const maxCountry = Math.max(...(data.topCountries ?? []).map((c) => c.activeUsers), 1);
  const maxEvent   = Math.max(...(data.topEvents ?? []).map((e) => e.value), 1);
  const maxTrend   = Math.max(...(data.dailyTrend ?? []).map((d) => d.activeUsers), 1);

  return (
    <div>
      {/* â”€â”€ Header â”€â”€ */}
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: GA_BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 192 192" fill="none">
              <path d="M150 24h-24a12 12 0 0 0-12 12v120a12 12 0 0 0 12 12h24a12 12 0 0 0 12-12V36a12 12 0 0 0-12-12Z" fill="#F9AB00"/>
              <path d="M66 96H42a12 12 0 0 0-12 12v48a12 12 0 0 0 12 12h24a12 12 0 0 0 12-12v-48a12 12 0 0 0-12-12Z" fill="#E37400"/>
              <circle cx="108" cy="144" r="24" fill="#E37400"/>
            </svg>
          </div>
          <div>
            <div className="page-title">Google Analytics 4</div>
            <p className="page-sub">Website traffic &amp; audience Â· last 28 days</p>
          </div>
        </div>
        {(data.realtime?.activeUsers ?? 0) > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, background: "#dcfce7", borderRadius: 20, padding: "6px 14px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: GA_GREEN, display: "inline-block", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: GA_GREEN }}>{data.realtime?.activeUsers} live right now</span>
          </div>
        )}
      </div>

      {/* â”€â”€ KPI strip â”€â”€ */}
      <div className="kpi-strip">
        <Kpi label="Sessions"         value={fmt(data.totalSessions ?? 0)}            delta="" trend="flat" sub="" />
        <Kpi label="Users"            value={fmt(data.totalUsers ?? 0)}               delta="" trend="flat" sub="" />
        <Kpi label="New Users"        value={fmt(data.newUsers ?? 0)}                 delta="" trend="flat" sub="" />
        <Kpi label="Events"           value={fmt(data.eventCount ?? 0)}               delta="" trend="flat" sub="" />
        <Kpi label="Key Events"       value={fmt(data.keyEvents ?? 0)}                delta="" trend="flat" sub="" />
        <Kpi label="Avg. Engagement"  value={fmtTime(data.avgEngagementTime ?? 0)}    delta="" trend="flat" sub="" />
      </div>

      <div className="chart-grid" style={{ marginTop: 16 }}>

        {/* â”€â”€ Daily trend sparkline â”€â”€ */}
        {(data.dailyTrend?.length ?? 0) > 0 && (
          <div className="chart-card" style={{ gridColumn: "1 / -1" }}>
            <div className="chart-head">
              <h3>Daily Active Users</h3>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>last 28 days</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80, marginTop: 14 }}>
              {data.dailyTrend!.map((d) => {
                const h = Math.max(4, Math.round((d.activeUsers / maxTrend) * 80));
                return (
                  <div
                    key={d.date}
                    title={`${fmtDate(d.date)}: ${d.activeUsers} users`}
                    style={{ flex: 1, height: h, background: GA_BLUE, borderRadius: "3px 3px 0 0", opacity: 0.85, cursor: "default", transition: "opacity .15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
                  />
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtDate(data.dailyTrend![0].date)}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtDate(data.dailyTrend![data.dailyTrend!.length - 1].date)}</span>
            </div>
          </div>
        )}

        {/* â”€â”€ Traffic channels â”€â”€ */}
        {(data.channelBreakdown?.length ?? 0) > 0 && (
          <div className="chart-card">
            <div className="chart-head"><h3>Traffic Channels</h3></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
              {data.channelBreakdown!.map((c) => (
                <div key={c.channel}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-primary)", fontWeight: 500 }}>{c.channel}</span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmt(c.sessions)} sessions Â· {(c.bounceRate * 100).toFixed(0)}% bounce</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--canvas)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(c.sessions / maxChannel) * 100}%`, borderRadius: 4, background: GA_BLUE }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* â”€â”€ Top countries â”€â”€ */}
        {(data.topCountries?.length ?? 0) > 0 && (
          <div className="chart-card">
            <div className="chart-head"><h3>Top Countries</h3></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
              {data.topCountries!.map((c) => (
                <div key={c.country} style={{ display: "grid", gridTemplateColumns: "130px 1fr 36px", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.country}</span>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--canvas)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(c.activeUsers / maxCountry) * 100}%`, borderRadius: 4, background: GA_GREEN }} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "right" }}>{fmt(c.activeUsers)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* â”€â”€ Top pages â”€â”€ */}
        {(data.topPages?.length ?? 0) > 0 && (
          <div className="chart-card">
            <div className="chart-head"><h3>Top Pages</h3></div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>Page</th>
                <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>Views</th>
              </tr></thead>
              <tbody>
                {data.topPages!.map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px", color: "var(--text-primary)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.title}>{p.title}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(p.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* â”€â”€ Top events â”€â”€ */}
        {(data.topEvents?.length ?? 0) > 0 && (
          <div className="chart-card">
            <div className="chart-head"><h3>Top Events</h3></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
              {data.topEvents!.map((e) => (
                <div key={e.name} style={{ display: "grid", gridTemplateColumns: "140px 1fr 44px", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: "var(--text-primary)", fontWeight: 500, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--canvas)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(e.value / maxEvent) * 100}%`, borderRadius: 4, background: GA_YELLOW }} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "right" }}>{fmt(e.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
