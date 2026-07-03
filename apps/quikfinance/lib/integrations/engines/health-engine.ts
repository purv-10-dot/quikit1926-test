/**
 * Sync Health Engine — turns raw metrics into a 0–100 score plus actionable,
 * optionally AI-augmented recommendations. Pure scoring (testable); the AI hook
 * is layered on at the API.
 */

export type HealthInputs = {
  successRate: number;      // 0..1
  avgSyncMs: number;
  apiLatencyMs: number;
  failedRequests: number;
  retryCount: number;
  queueLength: number;
  tokenExpiresInHours: number | null; // null = no token model
  lastFailureAgeHours: number | null;
};

export type HealthReport = {
  score: number;
  band: "excellent" | "good" | "fair" | "poor" | "critical";
  factors: Array<{ key: string; impact: number; note: string }>;
  recommendations: string[];
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function computeHealth(inputs: HealthInputs): HealthReport {
  const factors: HealthReport["factors"] = [];
  let score = 100;

  const successPenalty = Math.round((1 - inputs.successRate) * 50);
  if (successPenalty) { score -= successPenalty; factors.push({ key: "success_rate", impact: -successPenalty, note: `Success rate ${(inputs.successRate * 100).toFixed(1)}%` }); }

  const latencyPenalty = inputs.apiLatencyMs > 2000 ? Math.min(15, Math.round((inputs.apiLatencyMs - 2000) / 400)) : 0;
  if (latencyPenalty) { score -= latencyPenalty; factors.push({ key: "latency", impact: -latencyPenalty, note: `API latency ${inputs.apiLatencyMs}ms` }); }

  const queuePenalty = inputs.queueLength > 50 ? Math.min(15, Math.round((inputs.queueLength - 50) / 25)) : 0;
  if (queuePenalty) { score -= queuePenalty; factors.push({ key: "queue", impact: -queuePenalty, note: `${inputs.queueLength} jobs queued` }); }

  const retryPenalty = Math.min(10, inputs.retryCount);
  if (retryPenalty) { score -= retryPenalty; factors.push({ key: "retries", impact: -retryPenalty, note: `${inputs.retryCount} retries` }); }

  if (inputs.tokenExpiresInHours != null && inputs.tokenExpiresInHours < 24) {
    const p = inputs.tokenExpiresInHours < 0 ? 30 : 12;
    score -= p; factors.push({ key: "token", impact: -p, note: inputs.tokenExpiresInHours < 0 ? "Token expired" : `Token expires in ${Math.round(inputs.tokenExpiresInHours)}h` });
  }

  score = clamp(score);
  const band = score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 55 ? "fair" : score >= 35 ? "poor" : "critical";

  const recommendations: string[] = [];
  if (inputs.successRate < 0.95) recommendations.push("Investigate failing records in the retry queue and re-run them individually.");
  if (inputs.apiLatencyMs > 2000) recommendations.push("Reduce batch size or sync frequency — the provider API is responding slowly.");
  if (inputs.tokenExpiresInHours != null && inputs.tokenExpiresInHours < 24) recommendations.push("Refresh or re-authorize the connection before the token expires.");
  if (inputs.queueLength > 50) recommendations.push("Add a parallel worker or increase the processing interval to drain the queue.");
  if (!recommendations.length) recommendations.push("Healthy — no action needed.");

  return { score, band, factors, recommendations };
}
