"use client";

import { HelpCircle, AlertTriangle, Search, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTqlSuggestions } from "./use-tql-suggestions";
import { TqlSuggestionsDropdown } from "./tql-suggestions-dropdown";

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
 * toggle in filter-view.tsx is set to "tql". Typing never auto-runs the
 * query or shows a syntax error — a query only reads as "wrong" once it's
 * finished, so evaluating (and erroring on) every keystroke of a
 * still-in-progress query is just noise. The query runs on Enter, clicking
 * Search, or blurring the box (matches Jira's JQL bar). An empty query runs
 * too — the API treats "no query text" as "no filter" (all data).
 *
 * Field-name autocomplete (use-tql-suggestions.ts) opens under the box while
 * typing a bare word and closes on pick/blur/Escape.
 */
export function TqlEditor({ value, onChange, error }: TqlEditorProps) {
  const [draft, setDraft] = useState(value);
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggest = useTqlSuggestions();

  // Keep the draft in sync when the parent swaps in a different query (e.g.
  // loading a saved TQL filter) without fighting the user's own typing.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const runNow = () => onChange(draft);

  function applyPick(s: Parameters<typeof suggest.pick>[1]) {
    const result = suggest.pick(draft, s);
    if (!result) return;
    setDraft(result.text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(result.cursor, result.cursor);
      }
    });
  }

  return (
    <div className="mb-4">
      <div className="flex items-start gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              suggest.onCaretMove(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onClick={(e) => {
              const el = e.currentTarget;
              suggest.onCaretMove(el.value, el.selectionStart ?? el.value.length);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              suggest.close();
              runNow();
            }}
            onKeyDown={(e) => {
              if (suggest.open && suggest.suggestions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  suggest.moveActive(1);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  suggest.moveActive(-1);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  applyPick(suggest.suggestions[suggest.activeIndex]!);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  suggest.close();
                  return;
                }
              }
              // Enter runs immediately; Shift+Enter inserts a newline (useful
              // once expanded, for a multi-line ORDER BY-heavy query).
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runNow();
              }
            }}
            placeholder='e.g. status != "Done" AND assignee = currentUser() ORDER BY updated DESC'
            spellCheck={false}
            rows={expanded ? 6 : 1}
            className={`w-full resize-y px-3 py-2 pr-8 text-sm font-mono border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              expanded ? "" : "leading-9 py-0 h-9 overflow-hidden whitespace-nowrap"
            } ${error ? "border-red-300" : "border-gray-300"}`}
          />
          <button
            type="button"
            // Mousedown + preventDefault so expanding/collapsing doesn't blur
            // the textarea — resizing the box shouldn't run a possibly
            // still-in-progress query.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse" : "Expand"}
            aria-label={expanded ? "Collapse editor" : "Expand editor"}
            className="absolute right-1.5 top-1.5 p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <TqlSuggestionsDropdown
            suggestions={suggest.suggestions}
            activeIndex={suggest.activeIndex}
            onPick={applyPick}
            onHover={suggest.setActiveIndex}
          />
        </div>
        <button
          type="button"
          // Mousedown (not click) so it fires before the textarea's blur —
          // otherwise blur's own runNow() would fire first and this click
          // would trigger a redundant second run right after.
          onMouseDown={(e) => {
            e.preventDefault();
            runNow();
          }}
          title="Search"
          aria-label="Search"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800"
        >
          <Search className="h-4 w-4" />
        </button>
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

      {error ? (
        <div className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {error.message}
            {error.position ? ` (line ${error.position.line}, col ${error.position.col})` : ""}
          </span>
        </div>
      ) : (
        focused && (
          <div className="mt-1.5 text-xs text-gray-400">
            Enter to search{expanded ? " · Shift+Enter for a new line" : ""}
          </div>
        )
      )}
    </div>
  );
}
