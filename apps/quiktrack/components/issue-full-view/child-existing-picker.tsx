"use client";

import { useEffect, useRef, useState } from "react";
import { CheckSquare, Bug, BookOpen, Search } from "lucide-react";

const TYPE_ICON: Record<string, { Icon: React.ElementType; color: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500" },
  BUG: { Icon: Bug, color: "text-red-500" },
  STORY: { Icon: BookOpen, color: "text-green-600" },
};

interface Hit {
  id: string;
  key: string;
  title: string;
  type: string;
}

/**
 * "Choose existing" picker for the epic's Child work items section. Searches
 * the project's non-subtask issues live and, on select, attaches the chosen
 * issue to this epic (the parent sets its `epicId`). Issues already excluded by
 * the caller (this epic's current children + the epic itself) are filtered via
 * `excludeIds`.
 */
export function ChildExistingPicker({
  projectId,
  excludeIds,
  onPick,
  onCancel,
}: {
  projectId: string;
  excludeIds: Set<string>;
  onPick: (hit: Hit) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [defaults, setDefaults] = useState<Hit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce the query.
  useEffect(() => {
    const t = setTimeout(() => setApplied(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Default page of the project's issues so the list isn't empty on open.
  useEffect(() => {
    let alive = true;
    void fetch(
      `/api/issues?projectId=${encodeURIComponent(projectId)}&excludeType=SUBTASK&limit=20`,
    )
      .then((r) => r.json())
      .then((res) => {
        if (!alive || !res?.success) return;
        setDefaults(
          (res.data ?? []).map((i: Hit) => ({ id: i.id, key: i.key, title: i.title, type: i.type })),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Live search.
  useEffect(() => {
    if (!applied) {
      setResults([]);
      return;
    }
    let alive = true;
    void fetch(
      `/api/issues?projectId=${encodeURIComponent(projectId)}&search=${encodeURIComponent(applied)}&excludeType=SUBTASK&limit=10`,
    )
      .then((r) => r.json())
      .then((res) => {
        if (!alive || !res?.success) return;
        setResults(
          (res.data ?? []).map((i: Hit) => ({ id: i.id, key: i.key, title: i.title, type: i.type })),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [applied, projectId]);

  const hits = (applied ? results : defaults).filter((h) => !excludeIds.has(h.id));

  return (
    <div className="mt-2 border border-gray-200 rounded-md bg-white p-2">
      <div className="flex items-center gap-2 border border-gray-300 rounded px-2 h-9 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500">
        <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Search work items to attach…"
          className="flex-1 text-sm bg-transparent focus:outline-none"
        />
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-gray-600 hover:underline shrink-0"
        >
          Cancel
        </button>
      </div>
      <div className="mt-1 max-h-64 overflow-y-auto">
        {hits.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400">
            {applied ? "No matches" : "No other work items to attach"}
          </div>
        ) : (
          hits.map((h) => {
            const T = TYPE_ICON[h.type] ?? TYPE_ICON.TASK!;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => onPick(h)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-left hover:bg-gray-50 rounded"
              >
                <T.Icon className={`h-4 w-4 shrink-0 ${T.color}`} />
                <span className="font-medium text-gray-800 shrink-0">{h.key}</span>
                <span className="text-gray-700 truncate min-w-0">{h.title}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
