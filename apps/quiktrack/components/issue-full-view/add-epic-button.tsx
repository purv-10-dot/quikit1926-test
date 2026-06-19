"use client";

import { useEffect, useRef, useState } from "react";
import { Edit3, Search, X, Zap } from "lucide-react";
import { SkeletonList } from "@/components/skeleton";

interface EpicHit {
  id: string;
  key: string;
  title: string;
}

/**
 * "Add epic" affordance shown in the issue breadcrumb when the issue isn't
 * yet under an epic. Click to open a small typeahead popover that lists the
 * project's epics; selecting one PATCHes the issue's `epicId` via the
 * supplied `onPick` callback.
 */
export function AddEpicButton({
  projectId,
  currentEpicId,
  onPick,
}: {
  projectId: string;
  currentEpicId: string | null;
  onPick: (epicId: string | null) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [epics, setEpics] = useState<EpicHit[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Lazy-load the project's epics on first open.
  useEffect(() => {
    if (!open || epics.length > 0) return;
    setLoading(true);
    void fetch(
      `/api/issues?projectId=${encodeURIComponent(projectId)}&type=EPIC&limit=50`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setEpics(
            (j.data ?? []).map((e: { id: string; key: string; title: string }) => ({
              id: e.id,
              key: e.key,
              title: e.title,
            })),
          );
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [open, epics.length, projectId]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? epics.filter(
        (e) => e.key.toLowerCase().includes(q) || e.title.toLowerCase().includes(q),
      )
    : epics;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900"
      >
        <Edit3 className="h-3 w-3" />
        Add epic
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-30">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search epics"
                className="w-full h-7 pl-6 pr-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading && (
              <div className="px-3 py-2">
                <SkeletonList rows={3} />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-400">
                {q ? "No matching epics" : "No epics in this project"}
              </div>
            )}
            {filtered.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={async () => {
                  await onPick(e.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-gray-50 ${
                  e.id === currentEpicId ? "bg-blue-50 text-blue-700" : "text-gray-700"
                }`}
              >
                <Zap className="h-3 w-3 text-purple-500 shrink-0" />
                <span className="font-medium shrink-0">{e.key}</span>
                <span className="truncate">{e.title}</span>
              </button>
            ))}
          </div>
          {currentEpicId && (
            <div className="border-t border-gray-100 p-1">
              <button
                type="button"
                onClick={async () => {
                  await onPick(null);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
              >
                <X className="h-3 w-3" />
                Clear epic
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
