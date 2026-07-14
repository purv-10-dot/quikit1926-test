"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Check, ChevronDown } from "lucide-react";
import {
  type FieldDef,
  type IdeaFieldValue,
  K,
  RATING_DOTS,
  ROADMAP_STYLES,
  THEME_META,
  optionLabel,
} from "./ideas-types";

/** Click-to-set 1–5 rating dots (Impact / Effort). Hover previews the value. */
function RatingCell({
  value,
  max,
  fill,
  onSave,
}: {
  value: number;
  max: number;
  fill: string;
  onSave: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1.5" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: max }).map((_, i) => {
        const on = i < shown;
        return (
          <button
            key={i}
            type="button"
            aria-label={`Set ${i + 1}`}
            onMouseEnter={() => setHover(i + 1)}
            onClick={() => onSave(i + 1 === value ? 0 : i + 1)}
            className="flex h-3.5 w-3.5 items-center justify-center"
          >
            {/* Filled = full dot; empty = tiny dot (matches JPD). */}
            <span className={`rounded-full transition-all ${on ? `h-2.5 w-2.5 ${fill}` : "h-1 w-1 bg-gray-300"}`} />
          </button>
        );
      })}
    </div>
  );
}

/** Searchable popover of a dropdown field's options, with a checkbox indicator
 *  (multi-style like JPD's Theme) or plain rows (Roadmap), and an "Edit field"
 *  footer — matching the JPD field pickers. */
function OptionsMenu({
  field,
  current,
  showCheck,
  anchor,
  onPick,
  onClose,
  render,
}: {
  field: FieldDef;
  current: string | null;
  showCheck: boolean;
  anchor: { x: number; y: number } | null;
  onPick: (value: string | null) => void;
  onClose: () => void;
  render: (value: string) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  const opts = field.options.filter(
    (o) => o.isActive && o.label.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div
      ref={ref}
      style={anchor ? { position: "fixed", left: anchor.x, top: anchor.y, width: 256 } : undefined}
      className="z-50 rounded-md border border-gray-200 bg-white shadow-lg"
    >
      <div className="border-b border-gray-100 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="w-full rounded border border-gray-200 py-1 pl-7 pr-2 text-sm outline-none focus:border-blue-400"
          />
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {opts.map((o) => {
          const selected = current === o.value;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onPick(selected ? null : o.value)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
            >
              {showCheck && (
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"}`}>
                  {selected && <Check className="h-3 w-3" />}
                </span>
              )}
              {render(o.value)}
            </button>
          );
        })}
        {opts.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No matches</div>}
      </div>
      <button
        type="button"
        onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("qt:edit-field", { detail: { fieldId: field.id } })); }}
        className="block w-full border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
      >
        Edit field
      </button>
    </div>
  );
}

/** Multi-select variant: checkboxes that toggle WITHOUT closing the menu, so you
 *  can pick several. Searchable + "Edit field" footer (JPD). */
function MultiOptionsMenu({
  field,
  selected,
  anchor,
  onToggle,
  onClose,
}: {
  field: FieldDef;
  selected: string[];
  anchor: { x: number; y: number } | null;
  onToggle: (value: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  const opts = field.options.filter(
    (o) => o.isActive && o.label.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div
      ref={ref}
      style={anchor ? { position: "fixed", left: anchor.x, top: anchor.y, width: 256 } : undefined}
      className="z-50 rounded-md border border-gray-200 bg-white shadow-lg"
    >
      <div className="border-b border-gray-100 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="w-full rounded border border-gray-200 py-1 pl-7 pr-2 text-sm outline-none focus:border-blue-400"
          />
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {opts.map((o) => {
          const isOn = selected.includes(o.value);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onToggle(o.value)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isOn ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"}`}>
                {isOn && <Check className="h-3 w-3" />}
              </span>
              {field.key === K.theme ? (
                <ThemeDisplay field={field} value={o.value} />
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[13px] font-medium text-blue-700">{o.label}</span>
              )}
            </button>
          );
        })}
        {opts.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No matches</div>}
      </div>
      <button
        type="button"
        onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("qt:edit-field", { detail: { fieldId: field.id } })); }}
        className="block w-full border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
      >
        Edit field
      </button>
    </div>
  );
}

function ThemeDisplay({ field, value }: { field: FieldDef; value: string }) {
  const meta = THEME_META[value];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 text-[13px] font-medium ${meta?.text ?? "text-gray-700"}`}>
      <span className="text-xs leading-none">{meta?.emoji ?? "•"}</span>
      {optionLabel(field, value)}
    </span>
  );
}

function RoadmapDisplay({ field, value }: { field: FieldDef; value: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${ROADMAP_STYLES[value] ?? "bg-gray-100 text-gray-600"}`}>
      {optionLabel(field, value)}
    </span>
  );
}

/**
 * One inline-editable grid cell. Ratings set on click; dropdowns (Theme,
 * Roadmap, any single-select) open a picker; text/number edit in place. Every
 * change calls onSave(fieldId, value), which the table persists + optimistically
 * reflects.
 */
export function EditableCell({
  field,
  value,
  onSave,
}: {
  field: FieldDef;
  value: IdeaFieldValue;
  onSave: (fieldId: string, value: IdeaFieldValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const blank = value === null || value === undefined || value === "";

  const rating = RATING_DOTS[field.key];
  if (rating) {
    return (
      <RatingCell
        value={blank ? 0 : Number(value)}
        max={rating.max}
        fill={rating.fill}
        onSave={(v) => onSave(field.id, v === 0 ? null : v)}
      />
    );
  }

  if (field.type === "DROPDOWN_MULTI") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    function toggle(v: string) {
      const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
      onSave(field.id, next.length ? next : null);
    }
    return (
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            if (open) { setOpen(false); return; }
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setAnchor({ x: r.left, y: r.bottom + 4 });
            setOpen(true);
          }}
          className="group/dd flex min-h-[24px] w-full items-center justify-between gap-1 text-left"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {selected.length === 0 ? (
              <span className="text-gray-300">—</span>
            ) : selected.length <= 2 ? (
              selected.map((v) =>
                field.key === K.theme ? (
                  <ThemeDisplay key={v} field={field} value={v} />
                ) : (
                  <span key={v} className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 text-[13px] font-medium text-blue-700">
                    {optionLabel(field, v)}
                  </span>
                ),
              )
            ) : (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[13px] font-medium text-gray-700">{selected.length} items</span>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-300 opacity-0 group-hover/dd:opacity-100" />
        </button>
        {open && (
          <MultiOptionsMenu
            field={field}
            selected={selected}
            anchor={anchor}
            onToggle={toggle}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    );
  }

  if (field.type === "DROPDOWN_SINGLE") {
    const isTheme = field.key === K.theme;
    const display = (v: string) => (isTheme ? <ThemeDisplay field={field} value={v} /> : <RoadmapDisplay field={field} value={v} />);
    const current = typeof value === "string" && value ? value : null;
    return (
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            if (open) { setOpen(false); return; }
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setAnchor({ x: r.left, y: r.bottom + 4 });
            setOpen(true);
          }}
          className="group/dd flex min-h-[24px] w-full items-center justify-between gap-1 text-left"
        >
          {current ? display(current) : <span className="text-gray-300">—</span>}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-300 opacity-0 group-hover/dd:opacity-100" />
        </button>
        {open && (
          <OptionsMenu
            field={field}
            current={current}
            showCheck={isTheme}
            anchor={anchor}
            render={display}
            onClose={() => setOpen(false)}
            onPick={(v) => { onSave(field.id, v); setOpen(false); }}
          />
        )}
      </div>
    );
  }

  if (field.type === "NUMBER") {
    if (editing) {
      return (
        <input
          type="number"
          autoFocus
          defaultValue={blank ? "" : String(value)}
          onBlur={(e) => { setEditing(false); const r = e.target.value.trim(); onSave(field.id, r === "" ? null : Number(r)); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="w-20 rounded border border-blue-400 px-1.5 py-0.5 text-sm outline-none"
        />
      );
    }
    const suffix = field.key === K.confidence ? "%" : "";
    return (
      <button type="button" onClick={() => setEditing(true)} className="min-h-[24px] w-full text-left tabular-nums text-gray-800">
        {blank ? <span className="text-gray-300">—</span> : `${value}${suffix}`}
      </button>
    );
  }

  // Text / URL / everything else — inline text edit.
  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        defaultValue={blank ? "" : String(value)}
        onBlur={(e) => { setEditing(false); onSave(field.id, e.target.value.trim() || null); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-full rounded border border-blue-400 px-1.5 py-0.5 text-sm outline-none"
      />
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="min-h-[24px] w-full truncate text-left text-gray-800">
      {blank ? <span className="text-gray-300">—</span> : String(value)}
    </button>
  );
}
