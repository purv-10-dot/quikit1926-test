"use client";
import { useEffect, useState } from "react";
import SampleDataBanner from "@/components/ui/SampleDataBanner";
import { useRouter } from "next/navigation";
import { getInstagramData, type InstagramData } from "@/lib/api/instagram";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";
import PeriodPicker from "@/components/ui/PeriodPicker";
import { resolvePeriod, periodLabel } from "@/lib/period/resolve";
import type { PeriodSpec } from "@/lib/period/types";

/** This page's pre-existing default range (matches the connector's own trailingWindow(7) fallback). */
const INITIAL_PERIOD: PeriodSpec = { preset: 7, compare: "none" };

const IG_COLOR = "#E1306C";
const IG_GRAD  = "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function timeAgo(ts: string): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function InstagramPage() {
  const router = useRouter();
  const [data, setData] = useState<InstagramData | null>(null);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<PeriodSpec>(INITIAL_PERIOD);

  useEffect(() => {
    setData(null);
    setError(false);
    getInstagramData(period).then(setData).catch(() => setError(true));
  }, [period]);

  const rangeLabel = periodLabel(resolvePeriod(period));

  if (error) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Instagram</div><p className="page-sub">Account analytics</p></div>
      </div>
      <NotConnected icon="âš ï¸" title="Couldn't load Instagram data" body="Something went wrong. Please refresh and try again." ctaHref="/instagram" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Instagram</div><p className="page-sub">Account analytics</p></div>
      </div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Instagram</div><p className="page-sub">Account analytics</p></div>
      </div>
      <NotConnected
        icon="ðŸ“¸"
        title="Instagram not connected"
        body="Connect your Facebook page with a linked Instagram business account to see reach, impressions, and post analytics."
        ctaHref="/integrations"
        ctaLabel="Connect via Facebook"
      />
    </div>
  );

  const engRate = Number(data.engagementRate ?? 0);

  return (
    <div>
      {data.isSampleData && <SampleDataBanner platform="Instagram" />}
      {/* Header */}
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: IG_GRAD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
          </div>
          <div>
            <h1 className="greeting" style={{ fontSize: 22 }}>
              {data.username ? `@${data.username}` : "Instagram"}
            </h1>
            <p className="page-sub" style={{ margin: 0 }}>Account analytics Â· {rangeLabel}</p>
          </div>
        </div>
        <div className="greet-actions">
          <PeriodPicker value={period} onChange={setPeriod} allowCompare={false} />
          <button className="btn" type="button" onClick={() => router.push("/integrations")}>Reconnect</button>
          <button className="btn btn-primary" type="button" onClick={() => router.push("/ask-ai")}>âœ¦ Ask AI</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpi-strip" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <Kpi label="Followers"       value={fmt(data.followers ?? 0)}         delta="" trend="flat" sub="total" />
        <Kpi label="Reach"           value={fmt(data.reach ?? 0)}             delta="" trend="flat" sub={rangeLabel} />
        <Kpi label="Impressions"     value={fmt(data.impressions ?? 0)}       delta="" trend="flat" sub={rangeLabel} />
        <Kpi label="Profile Views"   value={fmt(data.profileViews ?? 0)}      delta="" trend="flat" sub={rangeLabel} />
        <Kpi label="Eng. Rate"       value={`${engRate.toFixed(1)}%`}         delta="" trend={engRate >= 3 ? "up" : engRate >= 1 ? "flat" : "down"} sub="reach basis" />
      </div>

      {data.insightsNotice && (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "-6px 0 16px" }}>{data.insightsNotice}</p>
      )}

      {/* Content grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        {/* Summary metrics */}
        <div className="chart-card">
          <div className="chart-head"><h3>Audience metrics</h3></div>
          <p className="chart-sub">Account-level performance overview</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            {[
              { label: "Followers",        value: data.followers ?? 0,       color: IG_COLOR },
              { label: "Reach",            value: data.reach ?? 0,           color: "#8B5CF6" },
              { label: "Impressions",      value: data.impressions ?? 0,     color: "#0EA5E9" },
              { label: "Accounts Engaged", value: data.accountsEngaged ?? 0, color: "#16A34A" },
            ].map((item) => (
              <div key={item.label} style={{ background: "var(--canvas)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: item.color }}>{fmt(item.value)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top posts */}
        <div className="chart-card">
          <div className="chart-head"><h3>Top posts by reach</h3></div>
          <p className="chart-sub">{rangeLabel}, sorted by reach</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {(data.topPosts ?? []).slice(0, 5).map((post, i) => (
              <div key={post.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "var(--canvas)", borderRadius: 8 }}>
                {post.thumbnail && (
                  <img src={post.thumbnail} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {post.message || <span style={{ color: "var(--text-muted)" }}>No caption</span>}
                  </p>
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(post.timestamp)}</span>
                    <span style={{ fontSize: 11, color: IG_COLOR, fontWeight: 600 }}>{fmt(post.reach)} reach</span>
                    {post.mediaType && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--border)", borderRadius: 4, padding: "1px 6px" }}>{post.mediaType}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {(data.topPosts ?? []).length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>No recent posts found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
