"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";

interface EpicLite {
  id: string;
  key: string;
  title: string;
}

const EPIC_PAGE = 20;

/**
 * Left-hand Epic panel for the backlog (Jira-parity). Fetches the project's
 * epics with cursor-based infinite scroll, so projects with many epics stay
 * fast. Each epic expands to a card with "View all details", which opens the
 * shared work-item drawer. Includes an inline "Create epic".
 */
export function EpicPanel({
  projectId,
  defaultStatusId,
  onOpenEpic,
  onCreated,
  onClose,
}: {
  projectId: string;
  defaultStatusId?: string;
  onOpenEpic: (id: string) => void;
  /** Notify the parent so its epic-linker list refreshes too. */
  onCreated: () => void;
  onClose: () => void;
}) {
  const [epics, setEpics] = useState<EpicLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Refs keep loadMore stable (deps: [projectId]) without stale cursor reads.
  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(
    async (initial = false) => {
      if (loadingRef.current) return;
      if (!initial && !hasMoreRef.current) return;
      loadingRef.current = true;
      try {
        const params = new URLSearchParams({ projectId, type: "EPIC", limit: String(EPIC_PAGE) });
        if (!initial && cursorRef.current) params.set("cursor", cursorRef.current);
        const res = await fetch(`/api/issues?${params.toString()}`).then((r) => r.json());
        if (res?.success) {
          const fresh: EpicLite[] = (res.data ?? []).map((e: EpicLite) => ({
            id: e.id,
            key: e.key,
            title: e.title,
          }));
          setEpics((prev) => (initial ? fresh : [...prev, ...fresh]));
          cursorRef.current = res.nextCursor ?? null;
          hasMoreRef.current = !!res.nextCursor;
          setHasMore(hasMoreRef.current);
        }
      } finally {
        loadingRef.current = false;
        setLoaded(true);
      }
    },
    [projectId],
  );

  // Initial page.
  useEffect(() => {
    cursorRef.current = null;
    hasMoreRef.current = true;
    void loadMore(true);
  }, [loadMore]);

  // Infinite scroll — load the next page as the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMoreRef.current && !loadingRef.current) {
          void loadMore();
        }
      },
      { rootMargin: "80px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // Reflect epics created/renamed elsewhere (e.g. via the drawer).
  useEffect(() => {
    function reload() {
      cursorRef.current = null;
      hasMoreRef.current = true;
      void loadMore(true);
    }
    window.addEventListener("quiktrack:issue-updated", reload);
    return () => window.removeEventListener("quiktrack:issue-updated", reload);
  }, [loadMore]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createEpic() {
    const t = title.trim();
    if (!t) {
      setCreating(false);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title: t, type: "EPIC", statusId: defaultStatusId }),
      }).then((r) => r.json());
      if (res?.success) {
        setTitle("");
        setCreating(false);
        cursorRef.current = null;
        hasMoreRef.current = true;
        await loadMore(true);
        onCreated();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className="w-64 shrink-0 rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Epic</span>
        <button type="button" onClick={onClose} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Hide epic panel">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto py-1">
        {epics.map((e) => {
          const isOpen = expanded.has(e.id);
          return (
            <div key={e.id} className="border-t border-gray-50 first:border-t-0">
              <button
                type="button"
                onClick={() => toggle(e.id)}
                className="flex w-full items-center gap-1.5 px-2 py-2 text-left hover:bg-gray-50"
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                <span className="h-3 w-3 shrink-0 rounded-sm bg-purple-500" />
                <span className="truncate text-sm text-gray-800">{e.title}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pl-8 text-xs text-gray-500">
                  <p className="font-mono text-[10px] text-gray-400">{e.key}</p>
                  <button
                    type="button"
                    onClick={() => onOpenEpic(e.id)}
                    className="mt-2 w-full rounded border border-gray-200 px-2 py-1.5 text-center text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    View all details
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {loaded && epics.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No epics yet.</p>}

        {/* Infinite-scroll sentinel + loading hint. */}
        {hasMore && (
          <div ref={sentinelRef} className="px-3 py-2 text-center text-[11px] text-gray-400">
            {loaded ? "Loading…" : ""}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 p-2">
        {creating ? (
          <input
            autoFocus
            value={title}
            disabled={submitting}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createEpic();
              if (e.key === "Escape") { setTitle(""); setCreating(false); }
            }}
            onBlur={() => void createEpic()}
            placeholder="Epic name…"
            className="w-full rounded border border-blue-400 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Create epic
          </button>
        )}
      </div>
    </aside>
  );
}
