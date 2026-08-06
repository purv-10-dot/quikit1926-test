"use client";
import { useEffect, useState } from "react";
import { getXAdsData, type XAdsData } from "@/lib/api/x-ads";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

const X_BLACK = "#14171A";

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
    <span style={{ fontSize: 11, fontWeight: 600, color, background: `${color}18`, borderRadius: 5, padding: "2px 7px", textTransform: "capitalize" }}>{s}</span>
  );
}

export default function XAdsPage() {
  const [data, setData] = useState<XAdsData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getXAdsData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <div className="page-head"><div><div className="page-title">X Ads</div><p className="page-sub">Ad campaign analytics</p></div></div>
      <NotConnected icon="⚠️" title="Couldn't load X Ads data" body="Something went wrong. Please refresh and try again." ctaHref="/x-ads" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head"><div><div className="page-title">X Ads</div><p className="page-sub">Ad campaign analytics</p></div></div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head"><div><div className="page-title">X Ads</div><p className="page-sub">Ad campaign analytics</p></div></div>
      <NotConnected
        icon="📣"
        title="X Ads not connected"
        body="Connect your X Ads account to see spend, impressions, clicks, CTR, and campaign breakdowns."
        ctaHref="/integrations"
        ctaLabel="Connect X Ads"
      />
    </div>
  );

  return (
    <div>
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: X_BLACK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </div>
          <div>
            <div className="page-title">X Ads</div>
            <p className="page-sub">{data.accountName ?? "Ad campaign analytics"}</p>
          </div>
        </div>
      </div>

      <div className="kpi-strip">
        <Kpi label="Spend" value={fmtMoney(data.spend ?? 0)} color={X_BLACK} />
        <Kpi label="Impressions" value={fmt(data.impressions ?? 0)} color={X_BLACK} />
        <Kpi label="Clicks" value={fmt(data.clicks ?? 0)} color={X_BLACK} />
        <Kpi label="CTR" value={`${((data.ctr ?? 0) * 100).toFixed(2)}%`} color={X_BLACK} />
        <Kpi label="CPC" value={fmtMoney(data.cpc ?? 0)} color={X_BLACK} />
        <Kpi label="Conversions" value={fmt(data.conversions ?? 0)} color={X_BLACK} />
      </div>

      {(data.campaigns?.length ?? 0) > 0 && (
        <div className="chart-card" style={{ marginTop: 16 }}>
          <div className="chart-head"><h3>Campaigns</h3></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Campaign", "Status", "Spend", "Impressions", "Clicks", "CTR"].map((h) => (
                <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.campaigns!.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 8px", color: "var(--text-primary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</td>
                  <td style={{ padding: "7px 8px" }}>{statusBadge(c.status)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{fmtMoney(c.spend)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-muted)" }}>{fmt(c.impressions)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{fmt(c.clicks)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{(c.ctr * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
