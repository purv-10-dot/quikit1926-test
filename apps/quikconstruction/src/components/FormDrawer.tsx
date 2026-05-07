"use client";

/**
 * FormDrawer — Reusable slide-over drawer for create/edit forms.
 * Matches the reference Construction ERP's modal/drawer pattern.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./PageShell";

interface FormDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: "md" | "lg" | "xl" | "2xl";
  children: ReactNode;
  onSubmit?: () => void;
  submitLabel?: string;
  loading?: boolean;
  footer?: ReactNode;
}

const WIDTH_MAP = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

export function FormDrawer({
  open, onClose, title, subtitle, width = "lg",
  children, onSubmit, submitLabel = "Save", loading, footer,
}: FormDrawerProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity" onClick={onClose} />
      <div className={`fixed right-0 top-0 bottom-0 ${WIDTH_MAP[width]} w-full bg-white shadow-2xl flex flex-col z-50`}>
        {/* Header — subtle brand wash + accent bar so the drawer reads as
            an actionable surface rather than a flat panel. */}
        <div className="relative flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0 bg-gradient-to-b from-orange-50/40 to-white">
          <span aria-hidden className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600" />
          <div className="flex items-center gap-3">
            <span aria-hidden className="hidden sm:block w-1 h-9 rounded-full bg-gradient-to-b from-orange-500 to-orange-600" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{title}</h2>
              {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-orange-700 hover:bg-orange-50 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 shrink-0 bg-slate-50">
          {footer ?? (
            <>
              <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
              <PrimaryButton onClick={() => { onSubmit?.(); }} disabled={loading}>
                {loading ? "Saving..." : submitLabel}
              </PrimaryButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Reusable Form Field Components ─────────────────────────────────

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
        <span aria-hidden className="w-1 h-3 rounded-full bg-gradient-to-b from-orange-400 to-orange-600" />
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>;
}

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  span?: 1 | 2;
  hint?: string;
}

const BASE_INPUT =
  "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500 transition-shadow";
const INPUT_OK = "border-slate-300 hover:border-slate-400 focus:ring-orange-400 focus:shadow-[0_0_0_3px_rgba(251,146,60,0.12)]";
const INPUT_ERR = "border-rose-400 bg-rose-50 focus:ring-rose-500";

export function Field({ label, required, error, children, span, hint }: FieldProps) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export function TextInput({
  value, onChange, placeholder, type = "text", disabled, className, invalid, ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled}
      className={`${BASE_INPUT} ${invalid ? INPUT_ERR : INPUT_OK} ${className ?? ""}`}
      {...props} />
  );
}

export function NumberInput({
  value, onChange, placeholder, min, max, step, disabled, invalid,
}: { value: string | number; onChange: (v: string) => void; placeholder?: string; min?: number; max?: number; step?: string; disabled?: boolean; invalid?: boolean }) {
  return (
    <input type="number" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} min={min} max={max} step={step} disabled={disabled}
      className={`${BASE_INPUT} ${invalid ? INPUT_ERR : INPUT_OK}`} />
  );
}

/**
 * SelectInput — custom-styled dropdown that replaces the native <select>.
 *
 * Why custom: native selects render the option list in the OS chrome, which
 * makes it impossible to match the rest of the form (the harsh blue OS
 * highlight, system fonts, no rounded corners). This component renders an
 * absolutely-positioned panel below a button trigger so the dropdown list
 * gets the same rounded/border/shadow treatment as other inputs, and the
 * highlighted option uses orange-50 to match brand focus colors.
 *
 * API stays identical to the previous native version, so every existing
 * consumer (form drawers across the app) is upgraded with no call-site
 * changes.
 */
export function SelectInput({
  value, onChange, options, placeholder, disabled, invalid, searchable,
}: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; disabled?: boolean }>; placeholder?: string; disabled?: boolean; invalid?: boolean;
  /**
   * Show a search input at the top of the dropdown panel that filters
   * options by case-insensitive substring on label + value. Defaults to
   * auto-enabled when the option list has 8+ entries — long pickers
   * (states, materials, vendors, locations) get search for free without
   * call-site changes; short pickers (priority, status) stay clean.
   */
  searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  // Portal panel position — recomputed every time the trigger moves or
  // the viewport scrolls/resizes while the panel is open. Uses
  // `position: fixed` so the panel escapes any `overflow-hidden`
  // ancestor (e.g. a table wrapper or a drawer body) and can render
  // above the trigger when there's not enough room below.
  const [panelStyle, setPanelStyle] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: "below" | "above";
  } | null>(null);

  // `createPortal` requires a real DOM target, so defer rendering until
  // the component has mounted client-side. Avoids "document is not
  // defined" during SSR / hydration.
  useEffect(() => {
    setMounted(true);
  }, []);

  const showSearch = searchable ?? options.length >= 8;

  // Filtered options derived from the current query — case-insensitive
  // substring match on label, falling back to value (handy for code-only
  // option lists like SKU codes).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const selected = options.find((o) => o.value === value);
  const triggerLabel = selected?.label ?? placeholder ?? "Select…";

  // Close on outside click and on Escape. Outside means: not inside the
  // trigger wrapper AND not inside the portal panel — clicks inside the
  // portal must be treated as inside even though they live elsewhere
  // in the DOM tree.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Compute panel placement (below vs above) and size based on the
  // trigger's bounding rect. Recomputes on scroll / resize so the panel
  // tracks its trigger if the user scrolls a parent container while the
  // dropdown is open. Picks the side with more available space and
  // caps `maxHeight` so the panel never overflows the viewport.
  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return;
    }
    const compute = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const margin = 8; // viewport gap
      const desired = 280; // ideal panel height (search + ~6 rows)
      const spaceBelow = vh - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const placeAbove = spaceBelow < Math.min(desired, 200) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(desired, placeAbove ? spaceAbove : spaceBelow));
      setPanelStyle({
        top: placeAbove ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight,
        placement: placeAbove ? "above" : "below",
      });
    };
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open]);

  // Reset the search query whenever the panel closes so reopening starts
  // fresh — users expect "open dropdown" to show the full list again.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // When the panel opens, scroll the highlighted/selected option into view
  // and auto-focus the search box so users can start typing immediately.
  useEffect(() => {
    if (!open) return;
    const idx = filtered.findIndex((o) => o.value === value);
    setHighlight(idx >= 0 ? idx : 0);
    requestAnimationFrame(() => {
      if (showSearch) {
        searchRef.current?.focus();
      }
      const el = listRef.current?.querySelector<HTMLButtonElement>(
        `[data-idx="${idx >= 0 ? idx : 0}"]`,
      );
      el?.scrollIntoView({ block: "nearest" });
    });
    // We deliberately depend only on `open` here — re-running when
    // `filtered` changes would reset the highlight on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-clamp the highlight when the filtered list shrinks below the
  // current index, so Arrow Down / Enter never points at nothing.
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(filtered.length > 0 ? 0 : -1);
  }, [filtered.length, highlight]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt && !opt.disabled) choose(opt.value);
    }
  };

  // Panel JSX — rendered into a portal so it can escape any
  // `overflow-hidden` / `transform` ancestor (table wrappers, drawer
  // bodies, modal containers). Position is `fixed` and computed from
  // the trigger's bounding rect; the placement effect above flips it
  // above the trigger when space below is too tight.
  const panelNode =
    open && mounted && panelStyle
      ? createPortal(
          <div
            ref={panelRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={onListKey}
            style={{
              position: "fixed",
              top: panelStyle.placement === "above" ? undefined : panelStyle.top,
              bottom:
                panelStyle.placement === "above"
                  ? window.innerHeight - panelStyle.top
                  : undefined,
              left: panelStyle.left,
              width: panelStyle.width,
              maxHeight: panelStyle.maxHeight,
            }}
            className="z-[1000] rounded-lg border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 focus:outline-none flex flex-col"
          >
            {showSearch && (
              <div className="p-2 border-b border-gray-100 bg-white shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search…"
                    className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md border border-gray-200 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>
            )}
            <div ref={listRef} className="flex-1 overflow-auto py-1 min-h-0">
              {placeholder && !query && (
                <button
                  type="button"
                  data-idx={-1}
                  onClick={() => choose("")}
                  onMouseEnter={() => setHighlight(-1)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
                    value === "" ? "text-gray-900 bg-orange-50" : "text-gray-400 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex-1 truncate">{placeholder}</span>
                  {value === "" && <Check className="w-3.5 h-3.5 text-orange-600" />}
                </button>
              )}
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-400">
                  {query ? "No matches" : "No options"}
                </div>
              ) : (
                filtered.map((o, i) => {
                  const isSelected = o.value === value;
                  const isHighlighted = i === highlight;
                  const isDisabled = !!o.disabled;
                  return (
                    <button
                      type="button"
                      key={o.value}
                      data-idx={i}
                      disabled={isDisabled}
                      onClick={() => !isDisabled && choose(o.value)}
                      onMouseEnter={() => !isDisabled && setHighlight(i)}
                      className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                        isDisabled
                          ? "text-gray-300 cursor-not-allowed"
                          : isSelected
                            ? "bg-orange-50 text-orange-700 font-medium"
                            : isHighlighted
                              ? "bg-gray-100 text-gray-900"
                              : "text-gray-700"
                      }`}
                    >
                      <span className="flex-1 truncate">{o.label}</span>
                      {isSelected && !isDisabled && <Check className="w-3.5 h-3.5 text-orange-600" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${BASE_INPUT} bg-white text-left flex items-center gap-2 ${invalid ? INPUT_ERR : INPUT_OK}`}
      >
        <span className={`flex-1 truncate ${selected ? "text-gray-900" : "text-gray-400"}`}>
          {triggerLabel}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {panelNode}
    </div>
  );
}

export function TextAreaInput({
  value, onChange, placeholder, rows = 3, disabled, invalid,
}: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; disabled?: boolean; invalid?: boolean }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} rows={rows} disabled={disabled}
      className={`${BASE_INPUT} resize-none ${invalid ? INPUT_ERR : INPUT_OK}`} />
  );
}

/**
 * MultiSelectInput — renders selected options as removable chips + a dropdown
 * to add more. Picking from the dropdown appends to the array; clicking the X
 * on a chip removes that entry. Options already in `values` are filtered out
 * of the dropdown so users can't pick the same thing twice.
 */
export function MultiSelectInput({
  values, onChange, options, placeholder, disabled, invalid,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const labelOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(o.value, o.label);
    return (v: string) => m.get(v) ?? v;
  }, [options]);

  const remaining = useMemo(
    () => options.filter(o => !values.includes(o.value)),
    [options, values],
  );

  const add = (v: string) => {
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
  };
  const remove = (v: string) => onChange(values.filter(x => x !== v));

  // Inline pick-and-add picker, sharing the same custom-styled dropdown
  // panel as SelectInput. Each pick appends to the values array and keeps
  // the field reset to "" so it can prompt for the next addition.
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (v: string) => {
    if (values.includes(v)) remove(v);
    else add(v);
  };

  const triggerLabel =
    values.length === 0
      ? (placeholder ?? "Select…")
      : `${values.length} selected — pick more or remove`;

  const triggerDisabled = disabled || options.length === 0;

  return (
    <div ref={wrapRef} className="relative">
      <div className={`${BASE_INPUT} ${invalid ? INPUT_ERR : INPUT_OK} flex flex-wrap items-center gap-1.5 min-h-[38px] py-1.5 pr-8`}>
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 text-xs font-medium border border-orange-200">
            {labelOf(v)}
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(v)}
                className="hover:text-orange-900 leading-none"
                aria-label={`Remove ${labelOf(v)}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          disabled={triggerDisabled}
          onClick={() => !triggerDisabled && setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex-1 min-w-[120px] text-left text-sm bg-transparent focus:outline-none ${
            values.length === 0 && remaining.length > 0 ? "text-gray-400" : "text-gray-600"
          } disabled:text-gray-400`}
        >
          {triggerLabel}
        </button>
        <ChevronDown
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>

      {open && options.length > 0 && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 py-1"
        >
          {options.map((o) => {
            const selected = values.includes(o.value);
            return (
              <button
                type="button"
                key={o.value}
                role="option"
                aria-selected={selected}
                onClick={() => toggle(o.value)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                  selected
                    ? "bg-orange-50 text-orange-800 hover:bg-orange-100"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
                    selected ? "bg-orange-600 border-orange-600 text-white" : "border-gray-300 bg-white"
                  }`}
                  aria-hidden="true"
                >
                  {selected && <Check className="w-3 h-3" />}
                </span>
                <span className="flex-1 text-left">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CheckboxInput({
  checked, onChange, label, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled}
        className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

export function DateInput({
  value, onChange, disabled, min, max, invalid,
}: { value: string; onChange: (v: string) => void; disabled?: boolean; min?: string; max?: string; invalid?: boolean }) {
  return (
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
      disabled={disabled} min={min} max={max}
      className={`${BASE_INPUT} ${invalid ? INPUT_ERR : INPUT_OK}`} />
  );
}

export function CurrencyDisplay({ value, label }: { value: number | string; label: string }) {
  const num = typeof value === "string" ? parseFloat(value) || 0 : value;
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-bold text-gray-900">₹ {num.toLocaleString("en-IN")}</span>
    </div>
  );
}
