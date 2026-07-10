"use client";

/**
 * FormDrawer — Reusable slide-over drawer for create/edit forms.
 * Matches the reference Construction ERP's modal/drawer pattern.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ChevronDown, Search, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./PageShell";

interface FormDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
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
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
};

/** Inset, rounded right drawers — shared by FormDrawer + feature slide-overs. */
export const RIGHT_DRAWER_BACKDROP =
  "fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-[2px]";
export const RIGHT_DRAWER_FRAME =
  "pointer-events-none fixed inset-0 z-[60] flex justify-end p-3 sm:p-4";
export const RIGHT_DRAWER_PANEL =
  "pointer-events-auto relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.12),0_2px_8px_rgba(0,0,0,0.06)]";

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
    <>
      <div className={RIGHT_DRAWER_BACKDROP} onClick={onClose} />
      <div className={RIGHT_DRAWER_FRAME}>
        <div className={`${RIGHT_DRAWER_PANEL} ${WIDTH_MAP[width]}`}>
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 sm:px-8">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">{children}</div>

          <div className="flex shrink-0 items-center justify-end gap-3 bg-white px-6 py-5 sm:px-8">
            {footer ?? (
              <>
                <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                <PrimaryButton onClick={() => onSubmit?.()} disabled={loading}>
                  {loading ? "Saving..." : submitLabel}
                </PrimaryButton>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Reusable Form Field Components ─────────────────────────────────

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">
        <span className="inline-block w-1 h-3.5 bg-orange-500 rounded-sm" />
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
  "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500";
const INPUT_OK = "border-gray-300 focus:ring-orange-500";
const INPUT_ERR = "border-red-400 bg-red-50 focus:ring-red-500";

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

/**
 * InactiveStatusNotice — amber inline hint shown directly under a Status
 * field when the selected status is "inactive". Reminds the user that the
 * record is soft-deleted / hidden from selection lists and how to bring it
 * back. Render conditionally on `status === "inactive"` next to the Status
 * SelectInput across every master form so the cue is consistent everywhere.
 */
export function InactiveStatusNotice({ entityName = "record" }: { entityName?: string }) {
  return (
    <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
      <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
      <span>
        This {entityName.toLowerCase()} is inactive and hidden from selection lists.
        Set status to <span className="font-medium">“Active”</span> to make it usable.
      </span>
    </p>
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
    <input type="number" value={value}
      // Native number inputs still accept e / E / + / - (exponent + sign) —
      // that's how letters leak into amount fields. Block those keys, and
      // strip anything non-numeric that arrives via paste / autofill.
      onKeyDown={(e) => {
        if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
      }}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
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
  value, onChange, options, placeholder, disabled, invalid, searchable, footer, size = "md",
}: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; hint?: string; disabled?: boolean }>; placeholder?: string; disabled?: boolean; invalid?: boolean;
  /**
   * Show a search input at the top of the dropdown panel that filters
   * options by case-insensitive substring on label + value. Defaults to
   * auto-enabled when the option list has 8+ entries — long pickers
   * (states, materials, vendors, locations) get search for free without
   * call-site changes; short pickers (priority, status) stay clean.
   */
  searchable?: boolean;
  /** Optional footer rendered below the options list (e.g. “+ Add …”). */
  footer?: (helpers: { close: () => void }) => ReactNode;
  /** Visual size of the trigger. `sm` matches compact `text-xs` table rows. */
  size?: "sm" | "md";
}) {
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
        o.value.toLowerCase().includes(q) ||
        (o.hint?.toLowerCase().includes(q) ?? false),
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

  const close = () => setOpen(false);

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
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{o.label}</span>
                        {o.hint && (
                          <span className="block truncate text-[11px] font-normal text-gray-400">
                            {o.hint}
                          </span>
                        )}
                      </span>
                      {isSelected && !isDisabled && <Check className="w-3.5 h-3.5 shrink-0 text-orange-600" />}
                    </button>
                  );
                })
              )}
            </div>
            {footer ? (
              <div className="shrink-0 border-t border-gray-100 bg-white p-2">
                {footer({ close })}
              </div>
            ) : null}
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
        className={`${
          size === "sm"
            ? "w-full px-2 py-1.5 rounded border text-xs focus:outline-none focus:ring-1 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            : BASE_INPUT
        } bg-white text-left flex items-center gap-2 ${invalid ? INPUT_ERR : INPUT_OK}`}
      >
        <span className={`flex-1 truncate ${selected ? "text-gray-900" : "text-gray-400"}`}>
          {triggerLabel}
        </span>
        <ChevronDown
          className={`${size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
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

export type MultiSelectOption = { value: string; label: string; group?: string };

/**
 * MultiSelectInput — renders selected options as removable chips + a dropdown
 * to add more. Picking from the dropdown appends to the array; clicking the X
 * on a chip removes that entry. Options already in `values` are filtered out
 * of the dropdown so users can't pick the same thing twice.
 *
 * Optional `group` on each option shows sticky-style section headers in the
 * dropdown (sorted by group, then label). Omit `group` on all options for a
 * flat list.
 */
export function MultiSelectInput({
  values, onChange, options, placeholder, disabled, invalid,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  options: MultiSelectOption[];
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

  const groupedDropdown = useMemo(() => {
    const hasGroup = options.some((o) => String(o.group ?? "").trim().length > 0);
    if (!hasGroup) return null;
    const sorted = [...remaining].sort((a, b) => {
      const ga = String(a.group ?? "").trim().toLowerCase();
      const gb = String(b.group ?? "").trim().toLowerCase();
      const gc = ga.localeCompare(gb, undefined, { sensitivity: "base" });
      if (gc !== 0) return gc;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });
    type Row =
      | { kind: "header"; title: string; key: string }
      | { kind: "option"; o: MultiSelectOption };
    const rows: Row[] = [];
    let lastBucket = "\u0000";
    for (const o of sorted) {
      const g = String(o.group ?? "").trim();
      const bucket = g.toLowerCase() || "__uncategorized__";
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        rows.push({
          kind: "header",
          title: g || "Uncategorized",
          key: `g-${bucket}`,
        });
      }
      rows.push({ kind: "option", o });
    }
    return rows;
  }, [options, remaining]);

  const add = (v: string) => {
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
  };
  const remove = (v: string) => onChange(values.filter(x => x !== v));

  // Inline pick-and-add picker, sharing the same custom-styled dropdown
  // panel as SelectInput. Each pick appends to the values array and keeps
  // the field reset to "" so it can prompt for the next addition.
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerBoxRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Portal panel position — `position: fixed` so the dropdown escapes the
  // drawer body's `overflow-y-auto` (which otherwise clips it), mirroring
  // SelectInput. Recomputed on open and on scroll/resize so it tracks the
  // trigger, and flips above when there's not enough room below.
  const [panelStyle, setPanelStyle] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: "below" | "above";
  } | null>(null);

  // createPortal needs a real DOM target — defer until mounted client-side.
  useEffect(() => {
    setMounted(true);
  }, []);

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

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return;
    }
    const compute = () => {
      const el = triggerBoxRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const margin = 8;
      const desired = 280;
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

  const toggle = (v: string) => {
    if (values.includes(v)) remove(v);
    else add(v);
  };

  // With no chips, show the placeholder. Once chips render, the selection
  // is already visible, so the inline trigger drops to a quiet "Add more…"
  // hint — and disappears entirely when every option is picked.
  const triggerLabel =
    values.length === 0
      ? (placeholder ?? "Select…")
      : remaining.length > 0
        ? "Add more…"
        : "";

  const triggerDisabled = disabled || options.length === 0;

  const panelNode =
    open && mounted && panelStyle && options.length > 0
      ? createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-multiselectable="true"
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
            className="z-[1000] overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 py-1"
          >
            {(groupedDropdown ?? remaining.map((o) => ({ kind: "option" as const, o }))).length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">All options selected</div>
            ) : (
              (groupedDropdown ?? remaining.map((o) => ({ kind: "option" as const, o }))).map((row) => {
                if (row.kind === "header") {
                  return (
                    <div
                      key={row.key}
                      className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-100"
                      role="presentation"
                    >
                      {row.title}
                    </div>
                  );
                }
                const o = row.o;
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
                      className={`inline-flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
                        selected ? "bg-orange-600 border-orange-600 text-white" : "border-gray-300 bg-white"
                      }`}
                      aria-hidden="true"
                    >
                      {selected && <Check className="w-3 h-3" />}
                    </span>
                    <span className="flex-1 text-left">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className="relative">
      <div ref={triggerBoxRef} className={`${BASE_INPUT} ${invalid ? INPUT_ERR : INPUT_OK} flex flex-wrap items-center gap-1.5 min-h-[38px] py-1.5 pr-8`}>
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
          className={`flex-1 min-w-[80px] text-left text-sm bg-transparent focus:outline-none text-gray-400 disabled:text-gray-400`}
        >
          {triggerLabel}
        </button>
        <ChevronDown
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>
      {panelNode}
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
