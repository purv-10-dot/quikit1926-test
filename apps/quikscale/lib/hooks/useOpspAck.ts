"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Tracks whether the current user has acknowledged ("marked as reviewed") the
 * post-finalize changes to an OPSP, so the highlight is shown only the FIRST
 * time — and re-surfaces when a NEWER edit is made.
 *
 * Persisted SERVER-SIDE (via `/api/opsp/review-ack`, backed by the shared
 * `AuditEventRead` table) keyed by user + org + period + surface. This survives
 * logout — the previous localStorage approach was wiped by `globalSignOut()`'s
 * `localStorage.clear()`, so a reviewed OPSP kept re-appearing as pending after
 * re-login. `surface` is "form" or "review" so the OPSP Form and OPSP Review
 * are acknowledged independently.
 *
 * The stored value is the edit timestamp the user last acknowledged. Highlights
 * are due whenever there exists a strictly newer edit (`ackedTs < latestEditTs`).
 *
 * Drop-in: same `{ unacknowledged, acknowledge, ackedTs }` shape the form +
 * review pages already consume.
 */
export function useOpspAck(
  userId: string,
  year: number,
  quarter: string,
  surface: "form" | "review",
  latestEditTs: number,
): { unacknowledged: boolean; acknowledge: () => void; ackedTs: number } {
  const qc = useQueryClient();
  const queryKey = ["opsp-ack", userId, year, quarter, surface] as const;
  const enabled = !!userId && !!year && !!quarter;

  const { data: ackedTs = 0 } = useQuery({
    queryKey,
    enabled,
    // The mark must reflect the latest server state on mount (another device /
    // a fresh login), so never serve stale — but cached value still renders
    // instantly while the refetch runs.
    staleTime: 0,
    queryFn: async (): Promise<number> => {
      const res = await fetch(
        `/api/opsp/review-ack?year=${year}&quarter=${quarter}&surface=${surface}`,
      );
      const json = await res.json().catch(() => null);
      return json?.success ? Number(json.data?.ackedTs ?? 0) || 0 : 0;
    },
  });

  const { mutate } = useMutation({
    mutationFn: async (ts: number): Promise<number> => {
      const res = await fetch("/api/opsp/review-ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, quarter, surface, ackedTs: ts }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to save acknowledgement");
      return Number(json.data?.ackedTs ?? ts) || ts;
    },
    // Optimistic: flip the highlight off immediately; roll back on failure.
    onMutate: async (ts: number) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<number>(queryKey);
      qc.setQueryData<number>(queryKey, ts);
      return { prev };
    },
    onError: (_err, _ts, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData<number>(queryKey, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey });
    },
  });

  const acknowledge = useCallback(() => {
    if (latestEditTs > 0) mutate(latestEditTs);
  }, [latestEditTs, mutate]);

  const unacknowledged = latestEditTs > 0 && ackedTs < latestEditTs;

  return { unacknowledged, acknowledge, ackedTs };
}
