"use client";

import { HelpCircle, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

export interface TqlErrorInfo {
  message: string;
  position?: { pos: number; line: number; col: number };
}

interface TqlEditorProps {
  value: string;
  onChange: (next: string) => void;
  error: TqlErrorInfo | null;
}

/**
 * Admin-only TQL query bar — replaces <FilterToolbar> when the Basic/TQL
 * toggle in filter-view.tsx is set to "tql". Debounces input the same way
 * the Basic search box does (250ms) before the parent re-fetches.
 */
export function TqlEditor({ value, onChange, error }: TqlEditorProps) {
  const [draft, setDraft] = useState(value);

  // Keep the draft in sync when the parent swaps in a different query (e.g.
  // loading a saved TQL filter) without fighting the user's own typing.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (draft !== value) onChange(draft);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder='e.g. status != "Done" AND assignee = currentUser() ORDER BY updated DESC'
          spellCheck={false}
          className={`flex-1 h-9 px-3 text-sm font-mono border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? "border-red-300" : "border-gray-300"
          }`}
        />
        <a
          href="/settings/tql-help"
          target="_blank"
          rel="noopener noreferrer"
          title="Syntax help"
          aria-label="Syntax help"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <HelpCircle className="h-4 w-4" />
        </a>
      </div>

      {error && (
        <div className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {error.message}
            {error.position ? ` (line ${error.position.line}, col ${error.position.col})` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
