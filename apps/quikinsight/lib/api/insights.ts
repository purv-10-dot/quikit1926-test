import type { Insight, Recommendation } from "@/types";

// Real insights come from one grounded, rule-based endpoint (app/api/insights).
// We fetch once and slice it three ways to match the existing call sites.
type InsightsPayload = {
  insights: Insight[];
  recommendations: Recommendation[];
  activity: { text: string; time: string }[];
};

// Short-lived in-flight dedupe: getInsights + getRecommendations + getActivity
// are called together on the dashboard — share one request instead of three
// (each of which triggers a full server-side aggregation).
let inflight: { ts: number; promise: Promise<InsightsPayload> } | null = null;

async function fetchInsights(): Promise<InsightsPayload> {
  if (inflight && Date.now() - inflight.ts < 5000) return inflight.promise;
  const promise = (async () => {
    const res = await fetch("/api/insights", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load insights (${res.status})`);
    return (await res.json()) as InsightsPayload;
  })();
  inflight = { ts: Date.now(), promise };
  promise.catch(() => { inflight = null; }); // let failures retry
  return promise;
}

/** GET /insights */
export async function getInsights(): Promise<Insight[]> {
  return (await fetchInsights()).insights;
}

/** GET /recommendations */
export async function getRecommendations(): Promise<Recommendation[]> {
  return (await fetchInsights()).recommendations;
}

/** GET /activity — recent activity feed shown on the Dashboard page */
export async function getActivity(): Promise<{ text: string; time: string }[]> {
  return (await fetchInsights()).activity;
}
