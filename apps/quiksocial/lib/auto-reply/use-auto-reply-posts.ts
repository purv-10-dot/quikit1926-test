"use client";

import { useCallback, useEffect, useState } from "react";
import { unwrap } from "@/lib/utils/api-fetch";
import type { HookResult, PostWithControlRow } from "./client-types";

/**
 * Loads up to 50 published posts for the brand, ordered by publishedAt
 * desc, then enriches them with the per-post auto-reply toggle state
 * via the bulk `?postIds=` variant of GET /api/auto-reply/post-control.
 *
 * Posts without an explicit control row default to `autoReplyEnabled: true`
 * (the server-side default).
 */
export function useAutoReplyPosts(
  brandId: string | null,
): HookResult<PostWithControlRow[]> & {
  setEnabled: (postId: string, enabled: boolean) => Promise<void>;
} {
  const [data, setData] = useState<PostWithControlRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(
    async (signal?: AbortSignal) => {
      if (!brandId) {
        setData([]);
        setLoading(false);
        return;
      }
      setError(null);
      try {
        const postsRes = await fetch(
          `/api/posts?brandId=${encodeURIComponent(brandId)}&status=published&limit=50&orderBy=publishedAt`,
          { credentials: "include", signal },
        );
        if (!postsRes.ok) throw new Error(`HTTP ${postsRes.status}`);
        const postsBody = unwrap<{
          posts: Array<{
            id: string;
            title: string | null;
            content: string;
            platform: string;
            publishedAt: string | null;
            imageUrls?: string[];
            aiImageUrl?: string | null;
          }>;
        }>(await postsRes.json());
        const posts = postsBody.posts;

        // Bulk-fetch the per-post control toggle states in one round trip.
        let toggleByPostId: Record<string, boolean> = {};
        if (posts.length > 0) {
          const ids = posts.map((p) => p.id).join(",");
          const controlRes = await fetch(
            `/api/auto-reply/post-control?postIds=${encodeURIComponent(ids)}`,
            { credentials: "include", signal },
          );
          if (controlRes.ok) {
            const controlBody = unwrap<{
              controls: Record<string, boolean>;
            }>(await controlRes.json());
            toggleByPostId = controlBody.controls ?? {};
          }
          // A failure here isn't fatal — every post defaults to enabled.
        }

        setData(
          posts.map((p) => ({
            id: p.id,
            title: p.title ?? null,
            content: p.content,
            platform: p.platform,
            publishedAt: p.publishedAt,
            imageUrls: p.imageUrls ?? [],
            aiImageUrl: p.aiImageUrl ?? null,
            autoReplyEnabled: toggleByPostId[p.id] ?? true,
          })),
        );
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError("Couldn't load posts. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    },
    [brandId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetchPosts(controller.signal);
    return () => controller.abort();
  }, [fetchPosts]);

  const setEnabled = useCallback(async (postId: string, enabled: boolean) => {
    // Optimistic update.
    setData((prev) =>
      prev
        ? prev.map((p) =>
            p.id === postId ? { ...p, autoReplyEnabled: enabled } : p,
          )
        : prev,
    );
    try {
      const res = await fetch(`/api/auto-reply/post-control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ postId, autoReplyEnabled: enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setData((prev) =>
        prev
          ? prev.map((p) =>
              p.id === postId ? { ...p, autoReplyEnabled: !enabled } : p,
            )
          : prev,
      );
      setError("Couldn't update auto-reply for this post. Try again.");
    }
  }, []);

  return {
    data,
    loading,
    error,
    refetch: () => void fetchPosts(),
    setEnabled,
  };
}
