"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { DocRow } from "./docs-list";
import type { DocSummary } from "./use-docs";

/**
 * Renders doc rows from an infinite query and an IntersectionObserver sentinel
 * that calls `fetchNextPage` as it scrolls into view — so each list loads its
 * pages lazily instead of bulk-loading.
 */
export function PaginatedDocList({
  projectId,
  docs,
  loaded,
  loading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onDownload,
  onDragStart,
  canDelete,
  onDelete,
  emptyText,
}: {
  projectId: string;
  docs: DocSummary[];
  loaded: boolean;
  loading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onDownload?: (doc: DocSummary) => void;
  onDragStart?: (doc: DocSummary) => void;
  canDelete?: boolean;
  onDelete?: (doc: DocSummary) => void;
  emptyText: string;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchRef = useRef(fetchNextPage);
  fetchRef.current = fetchNextPage;

  const canLoadMore = hasNextPage && !isFetchingNextPage;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canLoadMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) fetchRef.current();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore]);

  if (loaded && docs.length === 0 && !loading) {
    return <p className="text-xs text-gray-400 px-3 py-3">{emptyText}</p>;
  }

  return (
    <div className="space-y-0">
      {docs.map((d) => (
        <DocRow
          key={d.id}
          projectId={projectId}
          doc={d}
          onDownload={onDownload}
          onDragStart={onDragStart}
          canDelete={canDelete}
          onDelete={onDelete}
        />
      ))}

      {(loading || isFetchingNextPage) && (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading…
        </div>
      )}

      {hasNextPage && <div ref={sentinelRef} className="h-px w-full" aria-hidden />}
    </div>
  );
}
