"use client";

/**
 * OPSP category + projected-value primitives — extracted from `page.tsx`
 * in R6.
 *
 * These two components share a module-level `catMetaCache` that maps
 * category name → `{ dataType, symbol, currency }`. `CategorySelect`
 * populates it when the dropdown loads; `ProjectedInput` reads it to
 * decide whether to show a currency prefix or a percentage suffix.
 *
 * Exports:
 *   - `CategorySelect`           — category dropdown with inline "+ Add"
 *   - `ProjectedInput`           — value input with currency/percentage affordances
 *   - `populateCatCache`         — imperative cache-filler used after fetches
 *   - `parseProjectedValue`      — helper exported for tests / siblings
 *   - `combineProjectedValue`    — inverse of `parseProjectedValue`
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENCIES, getScales } from "@/lib/utils/currency";
import { WithTooltip } from "./pickers";

const DATA_TYPES = ["Number", "Percentage", "Currency"] as const;

interface CatMeta {
  dataType: string;
  symbol: string | null;
  currency: string | null;
}
export const catMetaCache = new Map<string, CatMeta>();

export function populateCatCache(
  data: { name: string; dataType: string; currency: string | null }[],
) {
  data.forEach((c) => {
    const symbol =
      c.dataType === "Currency"
        ? (CURRENCIES.find((x) => x.code === c.currency)?.symbol ?? null)
        : null;
    catMetaCache.set(c.name, {
      dataType: c.dataType,
      symbol,
      currency: c.currency,
    });
  });
}

/* ── Scale abbreviation map for currency Projected values ──
   Maps the full-label scales from lib/utils/currency.ts to short abbreviations
   shown in the dropdown. Trillion and Hundred Crore are intentionally omitted. */
const SCALE_ABBR: Record<string, string> = {
  "": "-",
  Thousand: "K",
  Million: "M",
  Billion: "B",
  Lakh: "L",
  Crore: "Cr",
};

/** List of scale abbreviations available for a given currency. "-" comes first (no scale). */
export function getScaleAbbrs(currency: string): string[] {
  const scales = getScales(currency);
  return scales
    .map((s) => SCALE_ABBR[s.label])
    .filter((abbr): abbr is string => abbr !== undefined);
}

/** Parse a stored string like "250 K" or "1000.00 L" into { num, scale }. */
export function parseProjectedValue(
  raw: string,
  currency: string,
): { num: string; scale: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { num: "", scale: "" };
  const abbrs = getScaleAbbrs(currency).filter((a) => a && a !== "-");
  for (const abbr of abbrs) {
    const re = new RegExp(
      `^(.+?)\\s+${abbr.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}$`,
    );
    const m = trimmed.match(re);
    if (m) return { num: m[1].trim(), scale: abbr };
  }
  return { num: trimmed, scale: "" };
}

/** Combine a number string and scale abbreviation back into storage format. */
export function combineProjectedValue(num: string, scale: string): string {
  const n = (num ?? "").trim();
  if (!n) return "";
  return scale && scale !== "-" ? `${n} ${scale}` : n;
}

interface CatFull {
  name: string;
  dataType: string;
  currency: string | null;
}

/** Display a category name with currency symbol suffix for Currency types. */
export function displayCategory(name: string): string {
  if (!name) return name;
  const meta = catMetaCache.get(name);
  if (meta?.dataType === "Currency" && meta.symbol) return `${name} (${meta.symbol})`;
  return name;
}

export function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<CatFull[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("Number");
  const [newCurrency, setNewCurrency] = useState("NONE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 224 });
  const [flipUp, setFlipUp] = useState(false);

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < 300;
    setFlipUp(flip);
    if (flip) {
      setDropPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left, width: 224 });
    } else {
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: 224 });
    }
  }, []);

  function fetchCats() {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          const full = j.data as CatFull[];
          setCats(full);
          populateCatCache(full);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (open) fetchCats();
  }, [open]);

  const catNames = cats.map((c) => c.name);
  const allCats: CatFull[] =
    catNames.includes(value) || !value
      ? cats
      : [...cats, { name: value, dataType: "Number", currency: null }];

  function resetForm() {
    setAdding(false);
    setNewName("");
    setNewType("Number");
    setNewCurrency("NONE");
    setError("");
  }

  async function commitNew() {
    const trimmed = newName.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          dataType: newType,
          currency: newType === "Currency" ? newCurrency : null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        fetchCats();
        onChange(trimmed);
        setOpen(false);
        resetForm();
      } else setError(json.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative w-full min-w-0">
      <WithTooltip content={open ? "" : displayCategory(value) || ""} className="relative block w-full">
        <button
          ref={triggerRef}
          onClick={() => { if (!open) computePosition(); setOpen(!open); }}
          className="w-full flex items-center justify-between border border-gray-200 rounded px-2 py-1.5 bg-white hover:bg-gray-50 gap-1"
        >
          <span
            className={cn(
              "flex-1 min-w-0 text-sm whitespace-nowrap truncate text-left",
              value ? "text-gray-700" : "text-gray-400",
            )}
          >
            {value ? displayCategory(value) : "Select Category"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        </button>
      </WithTooltip>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[209]"
            onClick={() => {
              setOpen(false);
              resetForm();
            }}
          />
          <div
            className="fixed z-[210] bg-white border border-gray-200 rounded-lg shadow-lg py-1"
            style={{
              width: dropPos.width,
              left: dropPos.left,
              ...(flipUp ? { bottom: dropPos.bottom } : { top: dropPos.top }),
            }}
          >
            <div className="max-h-40 overflow-y-auto">
              {value && (
                <button
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                >
                  Clear
                </button>
              )}
              {allCats.length === 0 && !adding && (
                <p className="px-3 py-2 text-xs text-gray-400">No categories yet.</p>
              )}
              {allCats.map((c) => (
                <button
                  key={c.name}
                  onClick={() => {
                    onChange(c.name);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 whitespace-normal break-words leading-snug",
                    value === c.name && "text-accent-600 font-medium",
                  )}
                >
                  {displayCategory(c.name)}
                </button>
              ))}
            </div>

            <div className="border-t border-gray-100 mt-1 pt-1">
              {adding ? (
                <div className="px-3 py-2 space-y-2">
                  <input
                    ref={inputRef}
                    autoFocus
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") resetForm();
                    }}
                    placeholder="Category name *"
                    disabled={saving}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:opacity-50"
                  />
                  <select
                    value={newType}
                    onChange={(e) => {
                      setNewType(e.target.value);
                      setNewCurrency("NONE");
                    }}
                    disabled={saving}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:opacity-50"
                  >
                    {DATA_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {newType === "Currency" && (
                    <select
                      value={newCurrency}
                      onChange={(e) => setNewCurrency(e.target.value)}
                      disabled={saving}
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:opacity-50"
                    >
                      <option value="NONE">None</option>
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.symbol} {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {error && <p className="text-red-500 text-xs">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={resetForm}
                      disabled={saving}
                      className="flex-1 text-xs border border-gray-200 rounded py-1 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={commitNew}
                      disabled={saving || !newName.trim()}
                      className="flex-1 text-xs bg-gray-900 text-white rounded py-1 font-medium hover:bg-gray-800 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Add"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAdding(true);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-accent-600 hover:bg-accent-50 font-medium flex items-center gap-1.5"
                >
                  <span className="text-base leading-none">+</span> Add new category
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ProjectedInput({
  value,
  onChange,
  categoryName,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  categoryName: string;
  placeholder?: string;
  className?: string;
}) {
  const meta = catMetaCache.get(categoryName);
  const isCurrency = meta?.dataType === "Currency";
  const isPct = meta?.dataType === "Percentage";
  const symbol = meta?.symbol ?? null;
  const currency = meta?.currency ?? "USD";

  const { num: numPart, scale: scalePart } = isCurrency
    ? parseProjectedValue(value, currency)
    : { num: value, scale: "" };
  const availScaleAbbrs = isCurrency ? getScaleAbbrs(currency) : [];

  function handleNumChange(newNum: string) {
    if (isCurrency) onChange(combineProjectedValue(newNum, scalePart));
    else onChange(newNum);
  }
  function handleScaleChange(newScale: string) {
    onChange(combineProjectedValue(numPart, newScale));
  }

  return (
    <div
      className={cn(
        "flex items-center border border-gray-200 rounded bg-white focus-within:ring-1 focus-within:ring-accent-400 overflow-hidden",
        className,
      )}
    >
      {isCurrency && symbol && (
        <span className="w-[15px] flex-shrink-0 text-gray-500 text-xs text-center select-none">
          {symbol}
        </span>
      )}

      <input
        type="text"
        value={isCurrency ? numPart : value}
        onChange={(e) => handleNumChange(e.target.value)}
        placeholder={placeholder ?? (isPct ? "0" : isCurrency ? "0" : "Num")}
        className={cn(
          "flex-1 min-w-0 w-0 bg-transparent focus:outline-none placeholder-gray-400 text-left text-sm text-gray-700",
          isCurrency ? "px-1 py-1.5" : isPct ? "pl-2 pr-1 py-1.5" : "px-2 py-1.5",
        )}
      />

      {isCurrency && (
        <select
          value={scalePart || "-"}
          onChange={(e) => handleScaleChange(e.target.value)}
          className="w-[40px] flex-shrink-0 px-0.5 py-1.5 text-xs text-gray-600 bg-gray-50 border-l border-gray-200 focus:outline-none cursor-pointer"
          title="Scale"
        >
          {availScaleAbbrs.map((abbr) => (
            <option key={abbr} value={abbr}>
              {abbr}
            </option>
          ))}
        </select>
      )}

      {isPct && (
        <span className="pr-2 pl-0.5 text-gray-500 text-sm flex-shrink-0 select-none">
          %
        </span>
      )}
    </div>
  );
}
