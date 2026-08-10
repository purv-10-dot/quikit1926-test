"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getOverviewData, type OverviewData, type PlatformCard } from "@/lib/api/overview";
import { getRecommendations, getActivity } from "@/lib/api/insights";
import { useOverviewFilters } from "@/store/useOverviewFilters";
import Kpi from "@/components/ui/Kpi";
import RecommendationCards from "@/components/overview/RecommendationCards";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";
import type { Recommendation } from "@/types";

function displayFirstName(name?: string | null, email?: string | null): string {
  const n = (name ?? "").trim();
  if (n) return n.split(" ")[0];
  const local = (email ?? "").split("@")[0].split(/[._-]+/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}

function PlatformSection({ title, cards }: { title: string; cards: PlatformCard[] }) {
  if (cards.length === 0) return null;
  return (
    <>
      <div className="reco-head"><h3>{title}</h3></div>
      <div className="team-grid">
        {cards.map((pf) => (
          <div className="chart-card" key={pf.id}>
            <div className="chart-head" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 28, borderRadius: 8, background: pf.color,
                color: pf.color === "#FFE01B" ? "#1a1a1a" : "#fff",
                fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>
                {pf.name.slice(0, 2).toUpperCase()}
              </span>
              <h3 style={{ margin: 0 }}>{pf.name}</h3>
            </div>
            <div className="kpi-strip" style={{ marginTop: 8 }}>
              {pf.metrics.map((m) => (
                <Kpi key={m.label} label={m.label} value={m.value} delta="" trend="flat" sub="" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function OverviewPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { range, setRange } = useOverviewFilters();

  const [data, setData]                   = useState<OverviewData | null>(null);
  const [error, setError]                 = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [activity, setActivity]           = useState<{ text: string; time: string }[]>([]);

  useEffect(() => {
    setData(null); setError(false);
    getOverviewData(range).then(setData).catch(() => setError(true));
  }, [range]);

  useEffect(() => {
    getRecommendations().then(setRecommendations).catch(() => {});
    getActivity().then(setActivity).catch(() => {});
  }, []);

  const firstName = displayFirstName(session?.user?.name, session?.user?.email);

  return (
    <div>
      <div className="greet-row">
        <div>
          <h1 className="greeting">Welcome back, {firstName} 👋</h1>
          <p className="page-sub">Here&apos;s how your marketing is performing</p>
        </div>
        <div className="greet-actions">
          <button className="btn" onClick={() => router.push("/ask-ai")} type="button">✦ Ask AI</button>
          <button className="btn btn-primary" onClick={() => router.push("/reports")} type="button">+ New report</button>
        </div>
      </div>

      {error ? (
        <NotConnected icon="⚠️" title="Couldn't load your overview" body="Something went wrong reaching the server. Please refresh and try again." ctaHref="/overview" ctaLabel="Retry" />
      ) : !data ? (
        <>
          <SkeletonKpiStrip />
          <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
        </>
      ) : !data.connected ? (
        <NotConnected
          icon="📊"
          title="No platforms connected yet"
          body="Connect Google Analytics, Meta, HubSpot, and more in Integrations to see your live overview."
        />
      ) : (
        <>
          <div className="filter-row">
            <select className="range-select" value={range} onChange={(e) => setRange(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 12 months</option>
            </select>
          </div>

          {data.kpis.length > 0 && (
            <div className="kpi-strip">
              {data.kpis.map((k) => (
                <Kpi key={k.label} label={k.label} value={k.value} delta={k.delta} trend={k.trend} sub={k.sub} />
              ))}
            </div>
          )}

          <PlatformSection title="Google platforms"   cards={data.googlePlatforms}  />
          <PlatformSection title="Organic social"     cards={data.organicPlatforms} />
          <PlatformSection title="Paid advertising"   cards={data.paidPlatforms}    />
          <PlatformSection title="CRM & Leads"        cards={data.crmPlatforms}     />
          <PlatformSection title="Email marketing"    cards={data.emailPlatforms}   />
          <PlatformSection title="Local & Business"   cards={data.localPlatforms}   />

          <div className="reco-head">
            <h3>AI recommendations</h3>
            <a className="link" onClick={() => router.push("/insights")}>View all →</a>
          </div>
          {recommendations.length > 0 ? (
            <RecommendationCards items={recommendations} />
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No recommendations yet — they appear as your connected platforms gather data.</p>
          )}

          {activity.length > 0 && (
            <div className="chart-card" style={{ marginTop: 16 }}>
              <div className="chart-head"><h3>Recent activity</h3></div>
              <div>
                {activity.map((a, i) => (
                  <div className="alert-mini" key={i}>
                    <span style={{ color: "var(--text-muted)", fontSize: 11.5, width: 80, flexShrink: 0 }}>{a.time}</span>
                    <span>{a.text}</span>
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
