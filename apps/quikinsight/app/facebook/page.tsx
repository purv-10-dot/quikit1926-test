"use client";
import { useEffect, useState } from "react";
import SampleDataBanner from "@/components/ui/SampleDataBanner";
import { useRouter } from "next/navigation";
import { getFacebookData, type FacebookData } from "@/lib/api/facebook";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

const FB_BLUE = "#0866FF";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
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

export default function FacebookPage() {
  const router = useRouter();
  const [data, setData] = useState<FacebookData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getFacebookData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Facebook</div><p className="page-sub">Page analytics</p></div>
      </div>
      <NotConnected icon="âš ï¸" title="Couldn't load Facebook data" body="Something went wrong. Please refresh and try again." ctaHref="/facebook" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Facebook</div><p className="page-sub">Page analytics</p></div>
      </div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Facebook</div><p className="page-sub">Page analytics</p></div>
      </div>
      <NotConnected
        icon="ðŸ‘¤"
        title="Facebook not connected"
        body="Connect your Facebook page to see fans, reach, impressions, and post performance."
        ctaHref="/integrations"
        ctaLabel="Connect Facebook"
      />
    </div>
  );

  const engRate = Number(data.engagementRate ?? 0);

  return (
    <div>
      {data.isSampleData && <SampleDataBanner platform="Facebook" />}
      {/* Header */}
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: FB_BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
          </div>
          <div>
            <h1 className="greeting" style={{ fontSize: 22 }}>{data.pageName ?? "Facebook"}</h1>
            <p className="page-sub" style={{ margin: 0 }}>Page analytics Â· last 7 days</p>
          </div>
        </div>
        <div className="greet-actions">
          <button className="btn" type="button" onClick={() => router.push("/integrations")}>Reconnect</button>
          <button className="btn btn-primary" type="button" onClick={() => router.push("/ask-ai")}>âœ¦ Ask AI</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpi-strip" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <Kpi label="Page Fans"     value={fmt(data.fans ?? 0)}            delta="" trend="flat" sub="total followers" />
        <Kpi label="Reach"         value={fmt(data.reach ?? 0)}           delta="" trend="flat" sub="last 7 days" />
        <Kpi label="Impressions"   value={fmt(data.impressions ?? 0)}     delta="" trend="flat" sub="last 7 days" />
        <Kpi label="Engaged Users" value={fmt(data.engagedUsers ?? 0)}    delta="" trend="flat" sub="last 7 days" />
        <Kpi label="Eng. Rate"     value={`${engRate.toFixed(1)}%`}       delta="" trend={engRate >= 3 ? "up" : engRate >= 1 ? "flat" : "down"} sub="reach basis" />
      </div>

      {/* Post engagement breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="chart-card">
          <div className="chart-head"><h3>Engagement breakdown</h3></div>
          <p className="chart-sub">Post interactions â€” last 7 days</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            {[
              { label: "Reach",          value: data.reach ?? 0,           color: FB_BLUE },
              { label: "Impressions",    value: data.impressions ?? 0,     color: "#0084FF" },
              { label: "Engaged Users",  value: data.engagedUsers ?? 0,    color: "#6B40CC" },
              { label: "Post Engage.",   value: data.postEngagements ?? 0, color: "#16A34A" },
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
          <p className="chart-sub">Last 20 posts, sorted by impressions</p>
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
                    <span style={{ fontSize: 11, color: FB_BLUE, fontWeight: 600 }}>{fmt(post.reach)} reach</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmt(post.engagement)} eng.</span>
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
