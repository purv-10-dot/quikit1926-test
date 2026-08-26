"use client";
import { useEffect, useState } from "react";
import SampleDataBanner from "@/components/ui/SampleDataBanner";
import { useRouter } from "next/navigation";
import { getGoogleAdsData, type GoogleAdsData } from "@/lib/api/google-ads";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

const GOOGLE_BLUE = "#4285F4";

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
  const color =
    s === "enabled" || s === "active" ? "#16A34A"
    : s === "paused" ? "#D97706"
    : "#6B7280";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, background: `${color}18`, borderRadius: 5, padding: "2px 7px", textTransform: "capitalize" }}>
      {s === "enabled" ? "active" : s}
    </span>
  );
}

export default function GoogleAdsPage() {
  const router = useRouter();
  const [data, setData] = useState<GoogleAdsData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getGoogleAdsData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Google Ads</div><p className="page-sub">Ad campaign analytics</p></div>
      </div>
      <NotConnected icon="⚠️" title="Couldn't load Google Ads data" body="Something went wrong. Please refresh and try again." ctaHref="/google-ads" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Google Ads</div><p className="page-sub">Ad campaign analytics</p></div>
      </div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Google Ads</div><p className="page-sub">Ad campaign analytics</p></div>
      </div>
      <NotConnected
        icon="🎯"
        title="Google Ads not connected"
        body="Connect your Google Ads account to see spend, impressions, conversions, ROAS and full campaign breakdowns."
        ctaHref="/integrations"
        ctaLabel="Connect Google Ads"
      />
    </div>
  );

  return (
    <div>
      {data.isSampleData && <SampleDataBanner platform="Google Ads" />}
      {/* Header */}
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: GOOGLE_BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {/* Google Ads icon (simplified G shape) */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          </div>
          <div>
            <h1 className="greeting" style={{ fontSize: 22 }}>{data.accountName ?? "Google Ads"}</h1>
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
        <Kpi label="Spend"          value={fmtMoney(data.spend ?? 0)}                    delta="" trend="flat" sub="last 30 days" />
        <Kpi label="Impressions"    value={fmt(data.impressions ?? 0)}                   delta="" trend="flat" sub="last 30 days" />
        <Kpi label="Clicks"         value={fmt(data.clicks ?? 0)}                        delta="" trend="flat" sub="last 30 days" />
        <Kpi label="CTR"            value={`${(data.ctr ?? 0).toFixed(2)}%`}             delta="" trend={((data.ctr ?? 0) >= 1) ? "up" : "down"} sub="click-through rate" />
        <Kpi label="Conv. Rate"     value={`${(data.conversionRate ?? 0).toFixed(2)}%`}  delta="" trend={((data.conversionRate ?? 0) >= 3) ? "up" : "down"} sub="conversion rate" />
        <Kpi label="ROAS"           value={`${(data.roas ?? 0).toFixed(2)}x`}            delta="" trend={((data.roas ?? 0) >= 2) ? "up" : "down"} sub="return on ad spend" />
      </div>

      {/* Overview cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="chart-card">
          <div className="chart-head"><h3>Performance summary</h3></div>
          <p className="chart-sub">Aggregated stats across all campaigns · last 30 days</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            {[
              { label: "Total Spend",  value: fmtMoney(data.spend ?? 0),        color: GOOGLE_BLUE },
              { label: "Impressions",  value: fmt(data.impressions ?? 0),        color: "#8B5CF6" },
              { label: "Clicks",       value: fmt(data.clicks ?? 0),             color: "#0EA5E9" },
              { label: "Conversions",  value: String(data.conversions ?? 0),     color: "#16A34A" },
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
              { label: "CTR",           value: `${(data.ctr ?? 0).toFixed(2)}%`,           color: (data.ctr ?? 0) >= 1 ? "#16A34A" : "#DC2626" },
              { label: "CPC",           value: fmtMoney(data.cpc ?? 0),                    color: "#D97706" },
              { label: "Conv. Rate",    value: `${(data.conversionRate ?? 0).toFixed(2)}%`, color: (data.conversionRate ?? 0) >= 3 ? "#16A34A" : "#DC2626" },
              { label: "ROAS",          value: `${(data.roas ?? 0).toFixed(2)}x`,           color: (data.roas ?? 0) >= 2 ? "#16A34A" : "#DC2626" },
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
                  {["Campaign", "Status", "Spend", "Impressions", "Clicks", "CTR", "Conversions", "ROAS"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: h === "Campaign" ? "left" : "right", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.campaigns ?? []).map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 10px", color: "var(--text-primary)", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right" }}>{statusBadge(c.status)}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(c.spend)}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(c.impressions)}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(c.clicks)}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.ctr.toFixed(2)}%</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.conversions}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{(c.roas ?? 0).toFixed(2)}x</td>
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
