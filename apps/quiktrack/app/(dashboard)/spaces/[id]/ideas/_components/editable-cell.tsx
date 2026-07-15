"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Check, ChevronDown, Scale, Globe, AlertCircle, Plus } from "lucide-react";
import {
  type FieldDef,
  type IdeaFieldValue,
  K,
  RATING_DOTS,
  ROADMAP_STYLES,
  THEME_META,
  optionLabel,
  optionWeight,
  fieldHasWeights,
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

/** Confidence-style slider cell (0–100). Shows the value; on hover the draggable
 *  track appears with a live value bubble on the thumb. Drag or click the track
 *  to set; releases persist. Matches JPD's Confidence slider. */
function SliderCell({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const MAX = 100;
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Local value while dragging so the thumb tracks the cursor smoothly.
  const [local, setLocal] = useState<number | null>(value);
  useEffect(() => { if (!dragging) setLocal(value); }, [value, dragging]);
  const shown = dragging ? (local ?? 0) : (value ?? 0);

  function fromClientX(clientX: number): number {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(pct * MAX);
  }

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    const v0 = fromClientX(e.clientX);
    setLocal(v0);
    function onMove(ev: MouseEvent) { setLocal(fromClientX(ev.clientX)); }
    function onUp(ev: MouseEvent) {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const v = fromClientX(ev.clientX);
      setDragging(false);
      setLocal(v);
      onSave(v);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const [hover, setHover] = useState(false);
  const active = hover || dragging; // show the slider only while hovering/dragging
  const pct = (shown / MAX) * 100;

  return (
    <div
      className="flex min-h-[24px] items-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => e.stopPropagation()}
    >
      {active ? (
        // Hover/drag: value bubble (tooltip) + draggable track (JPD).
        <div className="flex w-full items-center gap-2">
          <span className="inline-flex min-w-[26px] justify-center rounded bg-gray-800 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {shown}
          </span>
          <div ref={trackRef} onMouseDown={startDrag} className="relative h-4 flex-1 cursor-pointer">
            <div className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-gray-200" />
            <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-700" style={{ width: `${pct}%` }} />
            <span
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-700 shadow"
              style={{ left: `${pct}%` }}
            />
          </div>
        </div>
      ) : (
        // Default: plain number, like the other cells.
        <span className="tabular-nums text-gray-800">
          {value === null ? <span className="text-gray-300">—</span> : value}
        </span>
      )}
    </div>
  );
}

/** Normalize a user-typed URL: add https:// if no scheme. Returns null if it
 *  can't be parsed into a valid http(s) URL (→ "Invalid link"). */
function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t || t === "https://" || t === "http://") return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null; // needs a real domain
    return u.toString();
  } catch {
    return null;
  }
}

/** Pretty label from a URL: brand-ish name from the domain (chatgpt.com → ChatGPT). */
function urlLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const name = host.split(".")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return url;
  }
}

/** URL (Documents) cell — JPD: empty → click opens an input prefilled "https://";
 *  invalid input shows a red "Invalid link" tooltip; a valid link renders as a
 *  favicon + brand-name chip that opens in a new tab. */
function UrlCell({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("https://");
  const [error, setError] = useState(false);
  const [imgOk, setImgOk] = useState(true);

  function open() { setDraft(value || "https://"); setError(false); setEditing(true); }
  function commit(raw: string) {
    if (raw.trim() === "" || raw.trim() === "https://") { onSave(null); setEditing(false); return; }
    const norm = normalizeUrl(raw);
    if (!norm) { setError(true); return; }
    onSave(norm);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (error) setError(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") commit(draft); if (e.key === "Escape") setEditing(false); }}
          onBlur={() => { if (!error) commit(draft); }}
          className={`w-full rounded border px-1.5 py-0.5 text-sm outline-none ${error ? "border-red-500 pr-6" : "border-blue-400"}`}
        />
        {error && (
          <>
            <AlertCircle className="absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500" />
            <span className="absolute left-2 top-full z-50 mt-1 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white shadow">
              Invalid link
            </span>
          </>
        )}
      </div>
    );
  }

  if (!value) {
    return (
      <button type="button" onClick={open} className="min-h-[24px] w-full text-left text-gray-300 hover:text-gray-500">
        —
      </button>
    );
  }

  let host = "";
  try { host = new URL(value).hostname.replace(/^www\./, ""); } catch { host = value; }
  const favicon = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
  return (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); open(); }}
      title={value}
      className="inline-flex max-w-full items-center gap-1.5 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[13px] font-medium text-gray-800 hover:bg-gray-50"
    >
      {imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={favicon} alt="" className="h-4 w-4 shrink-0 rounded-sm" onError={() => setImgOk(false)} />
      ) : (
        <Globe className="h-4 w-4 shrink-0 text-gray-400" />
      )}
      <span className="truncate">{urlLabel(value)}</span>
    </a>
  );
}

/** SHORT_TEXT cell — inline edit with a 255-char cap (JPD). Typing past the
 *  limit shows a red "Short text fields are limited to 255 characters" tooltip
 *  and blocks the save until it's within range. */
function ShortTextCell({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const MAX = 255;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const tooLong = draft.length > MAX;

  function open() { setDraft(value ?? ""); setEditing(true); }
  function commit() {
    if (tooLong) return; // block save while over the limit
    setEditing(false);
    onSave(draft.trim() || null);
  }

  if (editing) {
    return (
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          onBlur={() => { if (!tooLong) commit(); }}
          className={`w-full rounded border px-1.5 py-0.5 text-sm outline-none ${tooLong ? "border-red-500 pr-6" : "border-blue-400"}`}
        />
        {tooLong && (
          <>
            <AlertCircle className="absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500" />
            <span className="absolute left-2 top-full z-50 mt-1 whitespace-nowrap rounded bg-red-600 px-2 py-1 text-xs font-medium text-white shadow">
              Short text fields are limited to {MAX} characters
            </span>
          </>
        )}
      </div>
    );
  }
  return (
    <button type="button" onClick={open} className="min-h-[24px] w-full truncate text-left text-gray-800">
      {value ? value : <span className="text-gray-300">—</span>}
    </button>
  );
}

/** RICE score cell (JPD) — read-only computed value in a colored pill (low =
 *  red, higher = green). Hover shows the RICE explainer + expression. */
function RiceScoreCell({ value }: { value: number | null }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  if (value === null) {
    return <span className="text-gray-300">—</span>;
  }
  // Simple traffic-light: low scores red/amber, higher green (JPD-ish).
  const cls = value < 50 ? "bg-red-100 text-red-700" : value < 150 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700";
  const shown = Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
  return (
    <span
      className="relative inline-block"
      onMouseEnter={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPos({ x: Math.max(8, r.left - 40), y: r.bottom + 6 }); }}
      onMouseLeave={() => setPos(null)}
    >
      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[13px] font-semibold tabular-nums ${cls}`}>{shown}</span>
      {pos && (
        <span
          style={{ position: "fixed", left: pos.x, top: pos.y, width: 320 }}
          className="z-50 block rounded-lg border border-gray-200 bg-white p-4 text-left shadow-xl"
        >
          <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900"><span className="italic">fx</span> RICE score</span>
          <span className="block text-xs leading-relaxed text-gray-600">
            RICE scores product ideas based on 4 factors: Reach, impact, confidence, and effort.
            Ideas with the highest RICE score are prioritized first.
          </span>
          <span className="mt-2 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Expression</span>
          <span className="mt-0.5 block rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-700">
            {"{Reach} * {Impact} * {Confidence} / {Effort}"}
          </span>
        </span>
      )}
    </span>
  );
}

/** DATE cell — shows a formatted date; click opens a native date picker to edit.
 *  Value is an ISO date string (yyyy-mm-dd). Clearing the picker unsets it. */
function DateCell({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const iso = value ? value.slice(0, 10) : "";
  const label = value
    ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={iso}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => { setEditing(false); onSave(e.target.value || null); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
        className="w-full rounded border border-blue-400 px-1.5 py-0.5 text-sm outline-none"
      />
    );
  }
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(true); }} className="min-h-[24px] w-full text-left text-gray-800">
      {label ?? <span className="text-gray-300">—</span>}
    </button>
  );
}

/** LABELS cell — free-form multi-value (JPD): the collapsed cell shows label
 *  chips; click opens a type-to-filter menu where you can toggle existing labels
 *  or "Create '<x>'" (Enter) to add a brand-new one. Labels are plain strings
 *  (no option list), so creating one just adds it to this idea's value array.
 *  Known labels are gathered across the field for reuse. */
function LabelsCell({
  fieldId,
  value,
  known,
  onSave,
}: {
  fieldId: string;
  value: string[];
  known: string[];
  onSave: (v: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const suggestions = [...new Set([...value, ...known])];
  const filtered = q ? suggestions.filter((l) => l.toLowerCase().includes(q.toLowerCase())) : suggestions;
  const exact = suggestions.some((l) => l.toLowerCase() === q.trim().toLowerCase());

  function toggle(label: string) {
    const next = value.includes(label) ? value.filter((v) => v !== label) : [...value, label];
    onSave(next.length ? next : null);
  }
  function create() {
    const l = q.trim();
    if (!l || value.includes(l)) { setQ(""); return; }
    onSave([...value, l]);
    setQ("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          if (open) { setOpen(false); return; }
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setAnchor({ x: r.left, y: r.bottom + 4 });
          setQ(""); setOpen(true);
        }}
        className="group/dd flex min-h-[24px] w-full flex-wrap items-center gap-1 text-left"
      >
        {value.length === 0 ? (
          <span className="text-gray-300">—</span>
        ) : (
          value.map((l) => (
            <span key={l} className="inline-flex max-w-full items-center gap-1 truncate rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[13px] font-medium text-gray-700">
              {l}
            </span>
          ))
        )}
      </button>

      {open && anchor && (
        <div
          ref={ref}
          style={{ position: "fixed", left: anchor.x, top: anchor.y, width: 256 }}
          className="z-50 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && q.trim() && !exact) { e.preventDefault(); create(); } }}
              placeholder="Type a label"
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto pb-1">
            {/* Create is always shown (JPD); disabled until you type a new label. */}
            <button
              type="button"
              disabled={!q.trim() || exact}
              onClick={create}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-blue-600 hover:bg-gray-50 disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-transparent"
            >
              <span className="inline-flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Create{q.trim() ? ` “${q.trim()}”` : " label"}</span>
              <span className="rounded border border-gray-200 px-1 text-[10px] text-gray-400">Enter</span>
            </button>
            {filtered.map((l) => {
              const on = value.includes(l);
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => toggle(l)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"}`}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{l}</span>
                </button>
              );
            })}
          </div>
          {/* Edit field — opens the field editor (JPD), like the other pickers. */}
          <button
            type="button"
            onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("qt:edit-field", { detail: { fieldId } })); }}
            className="block w-full border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
          >
            Edit field
          </button>
        </div>
      )}
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
  knownLabels,
}: {
  field: FieldDef;
  value: IdeaFieldValue;
  onSave: (fieldId: string, value: IdeaFieldValue) => void;
  /** All label strings used across the field (for LABELS reuse suggestions). */
  knownLabels?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const blank = value === null || value === undefined || value === "";

  // RICE score — read-only computed value with a colored pill + hover explainer.
  if (field.key === K.score) {
    return <RiceScoreCell value={blank ? null : Number(value)} />;
  }

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

  if (field.type === "LABELS") {
    const labels = Array.isArray(value) ? (value as string[]) : [];
    return (
      <LabelsCell
        fieldId={field.id}
        value={labels}
        known={knownLabels ?? []}
        onSave={(v) => onSave(field.id, v)}
      />
    );
  }

  if (field.type === "DATE") {
    return (
      <DateCell
        value={typeof value === "string" && value ? value : null}
        onSave={(v) => onSave(field.id, v)}
      />
    );
  }

  // Confidence (0–100) renders as a draggable slider with a value bubble (JPD).
  if (field.key === K.confidence) {
    return (
      <SliderCell
        value={blank ? null : Number(value)}
        onSave={(v) => onSave(field.id, v)}
      />
    );
  }

  if (field.type === "DROPDOWN_MULTI") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const weighted = fieldHasWeights(field);
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
          <span className="flex min-w-0 flex-col items-start gap-1">
            {selected.length === 0 ? (
              <span className="text-gray-300">—</span>
            ) : (
              selected.map((v) =>
                field.key === K.theme ? (
                  <ThemeDisplay key={v} field={field} value={v} />
                ) : weighted ? (
                  // Weighted multi-select (JPD "Customer segments"): a bordered
                  // pill holding [scale icon + weight], then the label beside it.
                  <span key={v} className="inline-flex max-w-full items-center gap-1.5 text-[13px] text-gray-700">
                    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-0.5">
                      <Scale className="h-3.5 w-3.5 text-gray-500" />
                      <span className="font-medium tabular-nums text-gray-800">{optionWeight(field, v)}</span>
                    </span>
                    <span className="truncate">{optionLabel(field, v)}</span>
                  </span>
                ) : (
                  <span key={v} className="inline-flex max-w-full items-center gap-1 truncate rounded bg-blue-50 px-1.5 py-0.5 text-[13px] font-medium text-blue-700">
                    {optionLabel(field, v)}
                  </span>
                ),
              )
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

  if (field.type === "CHECKBOX") {
    const checked = value === true || value === "true" || value === 1;
    return (
      <span className="flex min-h-[24px] items-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onSave(field.id, checked ? null : true)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
        />
      </span>
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

  if (field.type === "URL") {
    return (
      <UrlCell
        value={typeof value === "string" && value ? value : null}
        onSave={(v) => onSave(field.id, v)}
      />
    );
  }

  if (field.type === "SHORT_TEXT") {
    return (
      <ShortTextCell
        value={typeof value === "string" && value ? value : null}
        onSave={(v) => onSave(field.id, v)}
      />
    );
  }

  // Text / everything else — inline text edit.
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
