"use client";

import { useEffect, useState } from "react";
import { Link2, Plus, X } from "lucide-react";
import { Input } from "@quikit/ui";

/**
 * Coverage links on a test case — the work items this case verifies.
 *
 * This is the link that makes the work-item panel populate: a case covering a
 * Story makes that Story show the case's tests. Search reuses the app's existing
 * `/api/search` endpoint, which is already permission-scoped, rather than adding
 * a second issue-search surface.
 */

interface CoverageLink {
  id: string;
  issueId: string;
  type: string;
  issue: { id: string; key: string; title: string } | null;
}

interface IssueHit {
  id: string;
  key: string;
  title: string;
}

export function CoverageLinks({
  caseId,
  projectId,
  disabled,
}: {
  /** Null in create mode — links can only attach to a saved case. */
  caseId: string | null;
  projectId: string;
  disabled?: boolean;
}) {
  const [links, setLinks] = useState<CoverageLink[]>([]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<IssueHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!caseId) return;
    fetch(`/api/test/cases/${caseId}/coverage`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: CoverageLink[] }) => {
        if (j.success && j.data) setLinks(j.data);
      })
      .catch(() => undefined);
  };

  useEffect(load, [caseId]);

  // Debounced search — typing a key like "QUIKSC-240" shouldn't fire a request
  // per keystroke.
  useEffect(() => {
    if (!adding || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      fetch(
        `/api/search?q=${encodeURIComponent(query.trim())}&projectId=${projectId}&limit=8`,
      )
        .then((r) => r.json())
        .then((j: { success?: boolean; data?: { issues?: IssueHit[] } }) => {
          setHits(j.data?.issues ?? []);
        })
        .catch(() => setHits([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, adding, projectId]);

  const addLink = async (issueId: string) => {
    if (!caseId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/test/cases/${caseId}/coverage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, type: "covers" }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? "Could not link that work item.");
        return;
      }
      setQuery("");
      setHits([]);
      setAdding(false);
      load();
    } finally {
      setBusy(false);
    }
  };

  const removeLink = async (linkId: string) => {
    if (!caseId) return;
    setBusy(true);
    try {
      await fetch(`/api/test/cases/${caseId}/coverage?linkId=${linkId}`, {
        method: "DELETE",
      });
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!caseId) {
    return (
      <p className="text-xs text-gray-400">
        Save the case first, then link the work items it covers.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {error}
        </p>
      )}

      {links.length === 0 && !adding && (
        <p className="text-xs text-gray-500">
          Not linked to any work item yet. Linking a Story here makes this
          case&apos;s results appear on that Story.
        </p>
      )}

      {links.map((l) => (
        <div
          key={l.id}
          className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1.5"
        >
          <Link2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="shrink-0 text-xs font-medium text-blue-700">
            {l.issue?.key ?? "—"}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
            {l.issue?.title ?? "(not found)"}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400">
            {l.type}
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={() => removeLink(l.id)}
              disabled={busy}
              className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
              aria-label={`Unlink ${l.issue?.key ?? "work item"}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}

      {adding ? (
        <div className="rounded border border-gray-200 p-2">
          <Input
            autoFocus
            value={query}
            placeholder="Search by key or title, e.g. QUIKSC-240"
            onChange={(e) => setQuery(e.target.value)}
          />
          {hits.length > 0 && (
            <div className="mt-1.5 max-h-40 overflow-y-auto">
              {hits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  disabled={busy}
                  onClick={() => addLink(h.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-gray-50"
                >
                  <span className="shrink-0 text-xs font-medium text-blue-700">
                    {h.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                    {h.title}
                  </span>
                </button>
              ))}
            </div>
          )}
          {query.trim().length >= 2 && hits.length === 0 && (
            <p className="mt-1.5 px-2 text-xs text-gray-400">No matches.</p>
          )}
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setQuery("");
            }}
            className="mt-1.5 px-2 text-xs text-gray-500 hover:text-gray-800"
          >
            Cancel
          </button>
        </div>
      ) : (
        !disabled && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-accent-700 hover:bg-accent-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Link a work item
          </button>
        )
      )}
    </div>
  );
}
