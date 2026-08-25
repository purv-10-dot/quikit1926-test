"use client";
import { useEffect, useState } from "react";
import SampleDataBanner from "@/components/ui/SampleDataBanner";
import { useRouter } from "next/navigation";
import { getMetaAdsData, type MetaAdsData } from "@/lib/api/meta-ads";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

const META_COLOR = "#0866FF";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  const color = s === "active" ? "#16A34A" : s === "paused" ? "#D97706" : "#6B7280";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, background: `${color}18`, borderRadius: 5, padding: "2px 7px", textTransform: "capitalize" }}>
      {status.toLowerCase()}
    </span>
  );
}

export default function MetaAdsPage() {
  const router = useRouter();
  const [data, setData] = useState<MetaAdsData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getMetaAdsData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Meta Ads</div><p className="page-sub">Ad campaign analytics</p></div>
      </div>
      <NotConnected icon="⚠️" title="Couldn't load Meta Ads data" body="Something went wrong. Please refresh and try again." ctaHref="/meta-ads" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Meta Ads</div><p className="page-sub">Ad campaign analytics</p></div>
      </div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Meta Ads</div><p className="page-sub">Ad campaign analytics</p></div>
      </div>
      <NotConnected
        icon="📢"
        title="Meta Ads not connected"
        body="Connect your Meta Ads account to see spend, impressions, clicks, CTR, ROAS and campaign breakdowns."
        ctaHref="/integrations"
        ctaLabel="Connect Meta Ads"
      />
    </div>
  );

  return (
    <div>
      {data.isSampleData && <SampleDataBanner platform="Meta Ads" />}
      {/* Header */}
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: META_COLOR, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
          </div>
          <div>
            <h1 className="greeting" style={{ fontSize: 22 }}>{data.accountName ?? "Meta Ads"}</h1>
            <p className="page-sub" style={{ margin: 0 }}>Ad campaign analytics · last 30 days</p>
          </div>
        </div>
        <div className="greet-actions">
          <button className="btn" type="button" onClick={() => router.push("/integrations")}>Reconnect</button>
          <button className="btn btn-primary" type="button" onClick={() => router.push("/ask-ai")}>✦ Ask AI</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpi-strip" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
        <Kpi label="Spend"        value={fmtMoney(data.spend ?? 0)}                delta="" trend="flat" sub="last 30 days" />
        <Kpi label="Impressions"  value={fmt(data.impressions ?? 0)}               delta="" trend="flat" sub="last 30 days" />
        <Kpi label="Clicks"       value={fmt(data.clicks ?? 0)}                    delta="" trend="flat" sub="last 30 days" />
        <Kpi label="CTR"          value={`${(data.ctr ?? 0).toFixed(2)}%`}         delta="" trend={((data.ctr ?? 0) >= 1) ? "up" : "down"} sub="click-through rate" />
        <Kpi label="CPC"          value={fmtMoney(data.cpc ?? 0)}                  delta="" trend="flat" sub="cost per click" />
        <Kpi label="ROAS"         value={`${(data.roas ?? 0).toFixed(2)}x`}        delta="" trend={((data.roas ?? 0) >= 2) ? "up" : "down"} sub="return on ad spend" />
      </div>

      {/* Overview cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="chart-card">
          <div className="chart-head"><h3>Performance summary</h3></div>
          <p className="chart-sub">Aggregated stats across all campaigns · last 30 days</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            {[
              { label: "Total Spend",    value: fmtMoney(data.spend ?? 0),                color: META_COLOR },
              { label: "Impressions",    value: fmt(data.impressions ?? 0),               color: "#8B5CF6" },
              { label: "Clicks",         value: fmt(data.clicks ?? 0),                    color: "#0EA5E9" },
              { label: "Conversions",    value: fmt(data.conversions ?? 0),               color: "#16A34A" },
            ].map((item) => (
              <div key={item.label} style={{ background: "var(--canvas)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-head"><h3>Efficiency metrics</h3></div>
          <p className="chart-sub">Cost and return metrics</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            {[
              { label: "CTR",      value: `${(data.ctr ?? 0).toFixed(2)}%`,  color: (data.ctr ?? 0) >= 1 ? "#16A34A" : "#DC2626" },
              { label: "CPC",      value: fmtMoney(data.cpc ?? 0),           color: "#D97706" },
              { label: "ROAS",     value: `${(data.roas ?? 0).toFixed(2)}x`, color: (data.roas ?? 0) >= 2 ? "#16A34A" : "#DC2626" },
              { label: "Conversions", value: String(data.conversions ?? 0),  color: "#0EA5E9" },
            ].map((item) => (
              <div key={item.label} style={{ background: "var(--canvas)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Campaigns table */}
      {(data.campaigns ?? []).length > 0 && (
        <div className="chart-card" style={{ marginBottom: 18 }}>
          <div className="chart-head"><h3>Campaign breakdown</h3></div>
          <p className="chart-sub">All campaigns · last 30 days</p>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Campaign", "Status", "Spend", "Impressions", "Clicks", "CTR", "Conversions"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: h === "Campaign" ? "left" : "right", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.campaigns ?? []).map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 10px", color: "var(--text-primary)", fontWeight: 500, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right" }}>{statusBadge(c.status)}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(c.spend)}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(c.impressions)}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(c.clicks)}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.ctr.toFixed(2)}%</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.conversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
