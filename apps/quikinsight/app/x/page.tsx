"use client";
import { useEffect, useState } from "react";
import SampleDataBanner from "@/components/ui/SampleDataBanner";
import { getXData, type XData } from "@/lib/api/x";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

const X_BLACK = "#14171A";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function XPage() {
  const [data, setData] = useState<XData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getXData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <div className="page-head"><div><div className="page-title">X (Twitter)</div><p className="page-sub">Organic social analytics</p></div></div>
      <NotConnected icon="⚠️" title="Couldn't load X data" body="Something went wrong. Please refresh and try again." ctaHref="/x" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head"><div><div className="page-title">X (Twitter)</div><p className="page-sub">Organic social analytics</p></div></div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head"><div><div className="page-title">X (Twitter)</div><p className="page-sub">Organic social analytics</p></div></div>
      <NotConnected
        icon="𝕏"
        title="X (Twitter) not connected"
        body="Connect your X account to see follower growth, impressions, engagement rate, and top posts."
        ctaHref="/integrations"
        ctaLabel="Connect X (Twitter)"
      />
    </div>
  );

  return (
    <div>
      {data.isSampleData && <SampleDataBanner platform="X (Twitter)" />}
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: X_BLACK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </div>
          <div>
            <div className="page-title">X (Twitter)</div>
            <p className="page-sub">{data.handle ? `@${data.handle}` : "Organic social analytics"}</p>
          </div>
        </div>
      </div>

      <div className="kpi-strip">
        <Kpi label="Followers" value={fmt(data.followers ?? 0)} color={X_BLACK} />
        <Kpi label="Following" value={fmt(data.following ?? 0)} color={X_BLACK} />
        <Kpi label="Tweets" value={fmt(data.tweets ?? 0)} color={X_BLACK} />
        <Kpi label="Impressions" value={fmt(data.impressions ?? 0)} color={X_BLACK} />
        <Kpi label="Engagements" value={fmt(data.engagements ?? 0)} color={X_BLACK} />
        <Kpi label="Eng. Rate" value={`${((data.engagementRate ?? 0) * 100).toFixed(2)}%`} color={X_BLACK} />
      </div>

      {(data.recentPosts?.length ?? 0) > 0 && (
        <div className="chart-card" style={{ marginTop: 16 }}>
          <div className="chart-head"><h3>Recent Posts</h3></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
            {data.recentPosts!.map((p) => (
              <div key={p.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
                <p style={{ margin: "0 0 6px", fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.5 }}>{p.text}</p>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-muted)" }}>
                  <span>👁 {fmt(p.impressions)}</span>
                  <span>❤️ {fmt(p.likes)}</span>
                  <span>🔁 {fmt(p.retweets)}</span>
                  <span>💬 {fmt(p.replies)}</span>
                  <span style={{ marginLeft: "auto" }}>{timeAgo(p.publishedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
