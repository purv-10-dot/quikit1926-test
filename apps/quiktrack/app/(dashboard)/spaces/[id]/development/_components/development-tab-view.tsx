"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { DevMetricsGrid, type DevMetrics } from "./dev-metrics";
import { RelatedWork, type RelatedWorkData } from "./related-work";

interface DevSummary extends RelatedWorkData {
  counts: { repos: number; branches: number; commits: number; pullRequests: number };
  metrics?: DevMetrics;
}

// Safe default so the grid never crashes if the API response predates the
// metrics field (e.g. an older cached server build) or omits it.
const EMPTY_METRICS: DevMetrics = {
  workItemsCompletedThisWeek: 0,
  completedTrend: [],
  prCycleTimeHours: null,
  leadTimeHours: null,
  deploymentFrequencyPerWeek: 0,
  workItemsOverdue: 0,
  workItemsReopened: 0,
  bugsOpen: 0,
  pullRequestsOpen: 0,
  vulnerabilitiesCritical: 0,
};

async function fetchSummary(projectId: string): Promise<DevSummary> {
  const r = await fetch(`/api/projects/${projectId}/development`);
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load");
  return j.data as DevSummary;
}

/**
 * Space-level Development tab — Jira-parity layout: Key metrics grid (8 tiles,
 * incl. real DORA computation) + a "Related work" panel with filter tabs and
 * per-tab empty states. Data comes from /api/projects/[id]/development.
 */
export function DevelopmentTabView({ projectId }: { projectId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["quiktrack", "space-development", projectId],
    queryFn: () => fetchSummary(projectId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-8 py-6 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading development activity…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="px-8 py-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700/50 dark:bg-red-900/20 dark:text-red-200">
          {(error as Error)?.message ?? "Failed to load development data"}
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      <DevMetricsGrid m={data.metrics ?? EMPTY_METRICS} />
      <RelatedWork data={data} />
    </div>
  );
}
