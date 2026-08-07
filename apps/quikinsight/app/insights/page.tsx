"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getInsights } from "@/lib/api/insights";
import type { Insight, InsightStatus } from "@/types";

const colorFor: Record<InsightStatus, string> = { attention: "#E8A33D", good: "#16A34A", decision: "#6C5CE0" };
type Filter = "all" | InsightStatus;

export default function InsightsPage() {
  const router = useRouter();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    getInsights().then(setInsights);
  }, []);

  const filtered = insights.filter((i) => filter === "all" || i.status === filter);

  return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Insights &amp; alerts</div><p className="page-sub">Every anomaly the system has caught</p></div>
      </div>
      <div className="tabs">
        {(["all", "attention", "good", "decision"] as Filter[]).map((f) => (
          <button key={f} className={`tab${filter === f ? " active" : ""}`} onClick={() => setFilter(f)} type="button">
            {f === "all" ? "All" : f === "attention" ? "Needs attention" : f === "good" ? "Working well" : "Decisions"}
          </button>
        ))}
      </div>
      <div>
        {filtered.map((i) => (
          <div className={`insight-row${i.resolved ? " resolved" : ""}`} key={i.id}>
            <span className="irow-dot" style={{ background: colorFor[i.status] }} />
            <div style={{ flex: 1 }}>
              <p className="irow-title">{i.title}</p>
              <p className="irow-meta">{i.meta}{i.resolved ? " · resolved" : ""}</p>
            </div>
            <button className="btn btn-sm" onClick={() => router.push("/ask-ai?q=" + encodeURIComponent(i.title))} type="button">
              Open
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
