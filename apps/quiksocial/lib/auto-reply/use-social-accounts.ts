"use client";

import { useCallback, useEffect, useState } from "react";
import { unwrap } from "@/lib/utils/api-fetch";
import type { HookResult, SocialAccountRow } from "./client-types";

/**
 * Connected social accounts for the wizard's account-picker AND the
 * platform toggle strip on the Rules tab.
 *
 * Reads /api/auto-reply/social-accounts. Server-side already filters to
 * FB/IG + the current brand, so the hook does no client-side filtering.
 *
 * `togglePlatform(id, enabled)` calls PATCH /api/auto-reply/platform-toggle
 * and optimistically updates the local row. Reverts on error. The server
 * also advances every cursor for that socialAccountId to now() when
 * enabling from a disabled state (per Phase 2 Q5 — comments that
 * arrived while disabled are NOT retroactively processed).
 */
export function useSocialAccounts(
  brandId: string | null,
): HookResult<SocialAccountRow[]> & {
  togglePlatform: (socialAccountId: string, enabled: boolean) => Promise<void>;
} {
  const [data, setData] = useState<SocialAccountRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(
    async (signal?: AbortSignal) => {
      if (!brandId) {
        setData([]);
        setLoading(false);
        return;
      }
      setError(null);
      try {
        const res = await fetch(
          `/api/auto-reply/social-accounts?brandId=${encodeURIComponent(brandId)}`,
          { credentials: "include", signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = unwrap<{ accounts: SocialAccountRow[] }>(await res.json());
        setData(body.accounts ?? []);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError("Couldn't load connected accounts.");
      } finally {
        setLoading(false);
      }
    },
    [brandId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetchAccounts(controller.signal);
    return () => controller.abort();
  }, [fetchAccounts]);

  const togglePlatform = useCallback(
    async (socialAccountId: string, enabled: boolean) => {
      // Optimistic flip — revert on error.
      setData((prev) =>
        prev
          ? prev.map((a) =>
              a.id === socialAccountId ? { ...a, autoReplyEnabled: enabled } : a,
            )
          : prev,
      );
      try {
        const res = await fetch(`/api/auto-reply/platform-toggle`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ socialAccountId, autoReplyEnabled: enabled }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        setData((prev) =>
          prev
            ? prev.map((a) =>
                a.id === socialAccountId
                  ? { ...a, autoReplyEnabled: !enabled }
                  : a,
              )
            : prev,
        );
        setError("Couldn't update the platform toggle. Try again.");
      }
    },
    [],
  );

  return {
    data,
    loading,
    error,
    refetch: () => void fetchAccounts(),
    togglePlatform,
  };
}
