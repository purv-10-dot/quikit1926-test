"use client";

import { useQuery } from "@tanstack/react-query";

interface KanbanBucketLite {
  stage: string;
  total: number;
}

// Same key as LeadKanban — must stay in sync. Both components subscribe to the
// same cache slot, so writes from drag/drop/SSE/loadMore re-render this badge
// automatically.
const KANBAN_QUERY_KEY = ["leads", "kanban", "board"] as const;

/**
 * Live total-leads badge. Reads the kanban board from React Query cache (no
 * fetching of its own — LeadKanban owns that). Falls back to the SSR-computed
 * `initialTotal` until the cache is populated.
 */
export function KanbanTotalBadge({ initialTotal }: { initialTotal: number }) {
  const { data } = useQuery<KanbanBucketLite[]>({
    queryKey: KANBAN_QUERY_KEY,
    enabled: false, // read-only subscriber to the cache slot
  });
  const total = data ? data.reduce((sum, b) => sum + b.total, 0) : initialTotal;
  return (
    <span className="rounded-full bg-crm-blue-soft px-3 py-1 text-xs font-medium text-crm-blue-dark">
      {total} {total === 1 ? "lead" : "leads"}
    </span>
  );
}
