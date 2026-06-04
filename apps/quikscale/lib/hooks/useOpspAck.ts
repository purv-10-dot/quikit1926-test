"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Tracks whether the current user has acknowledged ("marked as reviewed") the
 * post-finalize changes to an OPSP, so the highlight is shown only the FIRST
 * time — and re-surfaces when a NEWER edit is made.
 *
 * Persisted in `localStorage` (permanent per user/device, unlike the per-tab
 * `useSessionState`) keyed by user + period + surface. `surface` is "form" or
 * "review" so the OPSP Form and OPSP Review are acknowledged independently.
 *
 * The stored value is the edit timestamp the user last acknowledged. Highlights
 * are due whenever there exists a strictly newer edit (`storedTs < latestEditTs`).
 *
 * SSR-safe: reads localStorage only in the browser (effect), so first server
 * render is stable.
 */
export function useOpspAck(
  userId: string,
  year: number,
  quarter: string,
  surface: "form" | "review",
  latestEditTs: number,
): { unacknowledged: boolean; acknowledge: () => void } {
  const key = `quikscale:opsp-ack:${userId}:${year}:${quarter}:${surface}`;
  const [storedTs, setStoredTs] = useState(0);

  // (Re)read the stored acknowledgement whenever the key changes (e.g. once the
  // session resolves the real userId, or the period changes).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      setStoredTs(raw ? Number(raw) || 0 : 0);
    } catch {
      setStoredTs(0);
    }
  }, [key]);

  const unacknowledged = latestEditTs > 0 && storedTs < latestEditTs;

  const acknowledge = useCallback(() => {
    setStoredTs(latestEditTs);
    try {
      window.localStorage.setItem(key, String(latestEditTs));
    } catch {
      /* quota / private-mode — in-memory state still flips */
    }
  }, [key, latestEditTs]);

  return { unacknowledged, acknowledge };
}
