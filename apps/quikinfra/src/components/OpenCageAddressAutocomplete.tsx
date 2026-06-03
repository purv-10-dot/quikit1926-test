"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";

const INPUT_WRAP =
  "w-full rounded-lg border border-gray-300 text-sm focus-within:ring-2 focus-within:ring-orange-500 focus-within:border-transparent";
const INPUT_INNER =
  "w-full border-0 bg-transparent py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0";

export type AddressSuggestionPick = {
  formatted: string;
  state: string | null;
  city: string | null;
  cityMatched: boolean;
};

type SuggestionRow = AddressSuggestionPick;

type Props = {
  value: string | null | undefined;
  onChange: (next: string) => void;
  onSuggestionPick: (pick: AddressSuggestionPick) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function OpenCageAddressAutocomplete({
  value,
  onChange,
  onSuggestionPick,
  placeholder = "Search places in India…",
  disabled,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [highlight, setHighlight] = useState(-1);

  const fetchSuggestions = useCallback(async (q: string, signal: AbortSignal) => {
    const res = await fetch(
      `/api/geo/opencage?q=${encodeURIComponent(q)}&limit=8`,
      { signal, credentials: "same-origin" },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      suggestions?: SuggestionRow[];
      error?: string;
    };
    return Array.isArray(data.suggestions) ? data.suggestions : [];
  }, []);

  useEffect(() => {
    const q = (value ?? "").trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await fetchSuggestions(q, ac.signal);
        setSuggestions(rows);
        setOpen(rows.length > 0);
        setHighlight(-1);
      } catch (e: unknown) {
        const name = e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
        if (name !== "AbortError") {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        setLoading(false);
      }
    }, 320);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [value, fetchSuggestions]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (row: SuggestionRow) => {
    onChange(row.formatted);
    onSuggestionPick(row);
    setOpen(false);
    setSuggestions([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter" && highlight >= 0 && suggestions[highlight]) {
      e.preventDefault();
      pick(suggestions[highlight]);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={`relative flex items-center bg-white ${INPUT_WRAP} ${
          disabled ? "pointer-events-none bg-gray-50 opacity-60" : ""
        }`}
      >
        <Search
          className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden
        />
        <input
          type="text"
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          className={`${INPUT_INNER} ${loading ? "pr-9" : ""}`}
        />
        {loading ? (
          <Loader2
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400"
            aria-hidden
          />
        ) : null}
      </div>

      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-[100] mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((row, i) => (
            <li key={`${row.formatted}-${i}`} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-orange-50 ${
                  i === highlight ? "bg-orange-50" : ""
                }`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => pick(row)}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                <span className="break-words text-gray-800">{row.formatted}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
