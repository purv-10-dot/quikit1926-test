"use client";

import { useEffect, useMemo, useState } from "react";
import { NATIVE_FIELD_SUGGESTIONS, customFieldSuggestion, type FieldSuggestion } from "@/lib/tql/suggestions";
import { wordAtCursor, replaceWord } from "./tql-word-at-cursor";

interface CustomFieldLite {
  id: string;
  name: string;
}

/**
 * Autocomplete state for the TQL editor's field-name suggestions. Fetches
 * the org's custom fields once (same catalog the "More filters" Basic-mode
 * picker uses), then filters the combined native + custom field list by
 * whatever bare word sits under the cursor.
 */
export function useTqlSuggestions() {
  const [customFields, setCustomFields] = useState<CustomFieldLite[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [wordStart, setWordStart] = useState(0);
  const [wordEnd, setWordEnd] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/custom-fields/filterable")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.success) {
          setCustomFields((j.data ?? []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const allSuggestions = useMemo<FieldSuggestion[]>(
    () => [...NATIVE_FIELD_SUGGESTIONS, ...customFields.map((f) => customFieldSuggestion(f.name))],
    [customFields],
  );

  const filtered = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return allSuggestions.filter((s) => s.label.toLowerCase().startsWith(q)).slice(0, 20);
  }, [allSuggestions, query]);

  const suggestions = open ? filtered : [];

  /** Call on every keystroke/click in the textarea. */
  function onCaretMove(text: string, cursor: number) {
    const { word, start, end } = wordAtCursor(text, cursor);
    setWordStart(start);
    setWordEnd(end);
    setQuery(word);
    setActiveIndex(0);
    // Only opens for a non-empty word — an empty word (right after a space,
    // an operator, etc.) would otherwise show all ~20 fields unfiltered on
    // every keystroke, which is noisy rather than helpful.
    setOpen(word.length > 0);
  }

  function close() {
    setOpen(false);
  }

  /** Returns the new text + cursor position after inserting `s`, or null if
   *  the dropdown isn't open (nothing to apply). Caller applies the result. */
  function pick(text: string, s: FieldSuggestion): { text: string; cursor: number } | null {
    if (!open) return null;
    setOpen(false);
    return replaceWord(text, wordStart, wordEnd, s.insertText);
  }

  function moveActive(delta: number) {
    setActiveIndex((i) => {
      const n = suggestions.length;
      if (n === 0) return 0;
      return (i + delta + n) % n;
    });
  }

  return {
    suggestions,
    open,
    activeIndex,
    setActiveIndex,
    onCaretMove,
    close,
    pick,
    moveActive,
  };
}
