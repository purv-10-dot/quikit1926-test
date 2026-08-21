"use client";

import type { FieldSuggestion } from "@/lib/tql/suggestions";

interface TqlSuggestionsDropdownProps {
  suggestions: FieldSuggestion[];
  activeIndex: number;
  onPick: (s: FieldSuggestion) => void;
  onHover: (index: number) => void;
}

/** Field-name autocomplete list shown under the TQL textarea while typing a
 *  bare word — see use-tql-suggestions.ts for when it opens/closes/filters. */
export function TqlSuggestionsDropdown({ suggestions, activeIndex, onPick, onHover }: TqlSuggestionsDropdownProps) {
  if (suggestions.length === 0) return null;

  return (
    <ul
      role="listbox"
      aria-label="Field suggestions"
      className="absolute z-20 mt-1 max-h-56 w-full max-w-sm overflow-y-auto rounded border border-gray-200 bg-white py-1 shadow-lg"
    >
      {suggestions.map((s, i) => (
        <li key={`${s.kind}:${s.insertText}`} role="option" aria-selected={i === activeIndex}>
          <button
            type="button"
            // Mousedown (not click) fires before the textarea's blur, so the
            // selection doesn't get lost before onPick runs.
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(s);
            }}
            onMouseEnter={() => onHover(i)}
            className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm ${
              i === activeIndex ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="font-mono truncate">{s.label}</span>
            <span className="shrink-0 text-xs text-gray-400">{s.hint}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
