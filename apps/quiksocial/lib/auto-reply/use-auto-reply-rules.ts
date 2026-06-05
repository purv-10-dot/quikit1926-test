"use client";

import { useCallback, useEffect, useState } from "react";
import { unwrap } from "@/lib/utils/api-fetch";
import type { HookResult, RuleRow } from "./client-types";

/**
 * Fetches AutoReplyRule rows for the given brand.
 *
 * Re-fetches when `brandId` changes and on the `workspace-updated`
 * window event (cross-tab brand switches dispatched from the dashboard
 * layout's brand selector).
 */
export function useAutoReplyRules(
  brandId: string | null,
): HookResult<RuleRow[]> & {
  toggle: (id: string, isActive: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
} {
  const [data, setData] = useState<RuleRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(
    async (signal?: AbortSignal) => {
      if (!brandId) {
        setData([]);
        setLoading(false);
        return;
      }
      setError(null);
      try {
        const res = await fetch(
          `/api/auto-reply/rules?brandId=${encodeURIComponent(brandId)}`,
          { credentials: "include", signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = unwrap<{ rules: RuleRow[] }>(await res.json());
        setData(body.rules);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError("Couldn't load your rules. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    },
    [brandId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetchRules(controller.signal);
    const onUpdate = () => void fetchRules();
    window.addEventListener("workspace-updated", onUpdate);
    return () => {
      controller.abort();
      window.removeEventListener("workspace-updated", onUpdate);
    };
  }, [fetchRules]);

  const toggle = useCallback(
    async (id: string, isActive: boolean) => {
      // Optimistic update — flip immediately, revert on error.
      setData((prev) =>
        prev ? prev.map((r) => (r.id === id ? { ...r, isActive } : r)) : prev,
      );
      try {
        const res = await fetch(`/api/auto-reply/rules/${id}/toggle`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ isActive }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        // Revert.
        setData((prev) =>
          prev
            ? prev.map((r) => (r.id === id ? { ...r, isActive: !isActive } : r))
            : prev,
        );
        setError("Couldn't update the rule. Try again.");
      }
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    // Optimistic removal — restore on error.
    let removed: RuleRow | undefined;
    setData((prev) => {
      if (!prev) return prev;
      removed = prev.find((r) => r.id === id);
      return prev.filter((r) => r.id !== id);
    });
    try {
      const res = await fetch(`/api/auto-reply/rules/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
    } catch {
      if (removed) {
        setData((prev) => (prev ? [...prev, removed!] : prev));
      }
      setError("Couldn't delete the rule. Try again.");
    }
  }, []);

  return {
    data,
    loading,
    error,
    refetch: () => void fetchRules(),
    toggle,
    remove,
  };
}
