"use client";
import { useEffect, useState } from "react";
import { getSearchConsoleData, type SearchConsoleData } from "@/lib/api/search-console";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

const GSC_GREEN = "#34A853";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export default function SearchConsolePage() {
  const [data, setData] = useState<SearchConsoleData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getSearchConsoleData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <div className="page-head"><div><div className="page-title">Search Console</div><p className="page-sub">Organic search performance</p></div></div>
      <NotConnected icon="⚠️" title="Couldn't load Search Console data" body="Something went wrong. Please refresh and try again." ctaHref="/search-console" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head"><div><div className="page-title">Search Console</div><p className="page-sub">Organic search performance</p></div></div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head"><div><div className="page-title">Search Console</div><p className="page-sub">Organic search performance</p></div></div>
      <NotConnected
        icon="🔍"
        title="Google Search Console not connected"
        body="Connect your Search Console property to see clicks, impressions, CTR, average position, and top search queries."
        ctaHref="/integrations"
        ctaLabel="Connect Search Console"
      />
    </div>
  );

  return (
    <div>
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: GSC_GREEN, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><circle cx="11" cy="11" r="8" stroke="white" strokeWidth="2" fill="none"/><path d="M21 21l-4.35-4.35" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>
          </div>
          <div>
            <div className="page-title">Search Console</div>
            <p className="page-sub">{data.siteUrl ?? "Organic search performance"}</p>
          </div>
        </div>
      </div>

      <div className="kpi-strip">
        <Kpi label="Total Clicks" value={fmt(data.clicks ?? 0)} color={GSC_GREEN} />
        <Kpi label="Impressions" value={fmt(data.impressions ?? 0)} color={GSC_GREEN} />
        <Kpi label="Avg. CTR" value={`${Number(data.ctr ?? 0).toFixed(2)}%`} color={GSC_GREEN} />
        <Kpi label="Avg. Position" value={Number(data.avgPosition ?? 0).toFixed(1)} color="#4285F4" />
      </div>

      <div className="chart-grid" style={{ marginTop: 16 }}>
        {(data.topQueries?.length ?? 0) > 0 && (
          <div className="chart-card">
            <div className="chart-head"><h3>Top Queries</h3></div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "auto" }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 56 }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left",  fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>Query</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>Clicks</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>Impressions</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>CTR</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>Pos.</th>
                </tr>
              </thead>
              <tbody>
                {data.topQueries!.map((q, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.query}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(q.clicks)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>{fmt(q.impressions)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Number(q.ctr).toFixed(1)}%</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>{Number(q.position).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(data.topPages?.length ?? 0) > 0 && (
          <div className="chart-card">
            <div className="chart-head"><h3>Top Pages</h3></div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "auto" }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 100 }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left",  fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>Page</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>Clicks</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>Impressions</th>
                </tr>
              </thead>
              <tbody>
                {data.topPages!.map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.page}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(p.clicks)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>{fmt(p.impressions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
