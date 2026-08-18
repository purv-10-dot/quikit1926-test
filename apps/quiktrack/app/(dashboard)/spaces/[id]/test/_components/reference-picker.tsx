"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

/**
 * References field — searchable work-item picker.
 *
 * Replaces a free-text box whose placeholder said "JIRA-3, JIRA-4". Two problems
 * with that: it invited typing anything (including keys that don't exist), and it
 * advertised a competitor's issue keys inside QuikTrack. You search your own work
 * items by key or title instead.
 *
 * Stored shape is unchanged: `QtTestCase.refTickets`, a comma-separated string of
 * work-item KEYS. Keeping it a string rather than a relation is deliberate —
 * structured linking already exists as Coverage (`QtTestCaseIssueLink`, which
 * drives the QuikTest panel on a work item). References is the lighter
 * "mentioned in" list, and it round-trips through import/export as text.
 *
 * Because it is a case column, selections are part of the FORM and save with it —
 * unlike Coverage, which writes immediately.
 */

interface IssueHit {
  id: string;
  key: string;
  title: string;
}

/** Splits the stored string into keys, tolerating stray spaces and empties. */
export function parseRefKeys(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function ReferencePicker({
  value,
  onChange,
  projectId,
  disabled,
}: {
  /** Comma-separated keys, as stored on the case. */
  value: string;
  onChange: (next: string) => void;
  projectId: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<IssueHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const keys = parseRefKeys(value);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Debounced so typing a key doesn't fire a request per keystroke. Reuses the
  // app's existing permission-scoped /api/search rather than adding a second
  // issue-search surface.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const handle = window.setTimeout(() => {
      fetch(
        `/api/search?q=${encodeURIComponent(term)}&projectId=${projectId}&limit=8`,
      )
        .then((r) => r.json())
        .then((j: { data?: { issues?: IssueHit[] } }) => {
          setHits(j.data?.issues ?? []);
        })
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, projectId]);

  const add = (key: string) => {
    // De-duplicate case-insensitively: "quiktr-1" and "QUIKTR-1" are the same
    // work item, and storing both would show a duplicate chip.
    if (keys.some((k) => k.toLowerCase() === key.toLowerCase())) {
      setQuery("");
      setOpen(false);
      return;
    }
    onChange([...keys, key].join(", "));
    setQuery("");
    setOpen(false);
  };

  const remove = (key: string) => {
    onChange(keys.filter((k) => k !== key).join(", "));
  };

  return (
    <div ref={boxRef} className="relative">
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 ${
          disabled ? "border-gray-200 bg-gray-50" : "border-gray-300 bg-white"
        }`}
      >
        {keys.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700"
          >
            {k}
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(k)}
                aria-label={`Remove reference ${k}`}
                className="rounded hover:bg-blue-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}

        <span className="flex min-w-[8rem] flex-1 items-center gap-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <input
            value={query}
            disabled={disabled}
            placeholder={keys.length === 0 ? "Search by key or title…" : "Add another…"}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                // Enter takes the first hit; with none, fall back to the typed
                // text so a key that search hasn't indexed can still be recorded.
                if (hits.length > 0) add(hits[0].key);
                else if (query.trim()) add(query.trim());
              }
              if (e.key === "Backspace" && !query && keys.length > 0) {
                remove(keys[keys.length - 1]);
              }
              if (e.key === "Escape") setOpen(false);
            }}
            className="min-w-0 flex-1 border-0 p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:bg-transparent"
          />
        </span>
      </div>

      {open && query.trim().length >= 2 && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {searching && hits.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-400">Searching…</li>
          )}
          {!searching && hits.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-500">
              No work item matches. Press Enter to record “{query.trim()}” anyway.
            </li>
          )}
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(h.key);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent-50"
              >
                <span className="shrink-0 text-xs font-medium text-blue-700">
                  {h.key}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                  {h.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
