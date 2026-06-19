"use client";

/**
 * MultiLineDocForm — slide-over drawer for documents that pair a header
 * (single record fields) with a lines table (repeating rows).
 *
 * Used by Material Issue, Stock Transfer, Stock Reconciliation, Internal
 * Return — anywhere the API expects a `{ ...header, lines: [...] }` body.
 *
 * Submit behaviour:
 *   1. Validate: every required header/line field must be non-empty.
 *   2. POST `{ ...header, lines }` to `endpoint`.
 *   3. On `{ success: true }` → call `onSaved()` and close.
 *   4. On failure → show inline error.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { FieldConfig } from "../masters/MasterListPage";

// ─── Types ──────────────────────────────────────────────────────────

export type LineColumnType = "text" | "number" | "select" | "date";

export interface LineColumn {
  key: string;
  label: string;
  type: LineColumnType;
  required?: boolean;
  /** Pixel width hint for the column. */
  width?: number;
  /** For `type="select"` — the option list. */
  options?: Array<{ value: string; label: string }>;
  /** For `type="number"` — minimum value. */
  min?: number;
  /** For `type="number"` — maximum value. */
  max?: number;
  /** For `type="number"` — step size. */
  step?: number | string;
}

type Primitive = string | number | null;
type Row = Record<string, Primitive>;

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** API endpoint that receives the `{ ...header, lines }` POST body. */
  endpoint: string;
  /** Called after a successful save. The drawer closes after this fires. */
  onSaved: () => void | Promise<void>;
  /** Default values for header fields. */
  headerDefaults?: Record<string, Primitive>;
  /** Default value used for each new line row. */
  lineDefault: Row;
  headerFields: FieldConfig[];
  lineColumns: LineColumn[];
  /** Label for the "Add line" button — defaults to `"Add Line"`. */
  addLineLabel?: string;
  /** Optional content rendered above the lines table. */
  beforeLines?: ReactNode;
}

// ─── Component ──────────────────────────────────────────────────────

export function MultiLineDocForm({
  open, onClose, title, endpoint, onSaved,
  headerDefaults = {}, lineDefault, headerFields, lineColumns,
  addLineLabel = "Add Line", beforeLines,
}: Props) {
  const [header, setHeader] = useState<Record<string, Primitive>>({ ...headerDefaults });
  const [lines, setLines] = useState<Row[]>([{ ...lineDefault }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Lock background scroll while open. Reset state on each (re)open so the
  // user always lands on a clean form rather than the previous attempt.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setHeader({ ...headerDefaults });
      setLines([{ ...lineDefault }]);
      setError(null);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Recompute "is row N empty" so the trash button on the only row stays
  // disabled (we always keep at least one row visible).
  const canRemoveLine = lines.length > 1;

  const setHeaderField = (name: string, value: Primitive) => {
    setHeader((prev) => ({ ...prev, [name]: value }));
  };

  const setLineCell = (rowIdx: number, key: string, value: Primitive) => {
    setLines((prev) => prev.map((r, i) => (i === rowIdx ? { ...r, [key]: value } : r)));
  };

  const addLine = () => setLines((prev) => [...prev, { ...lineDefault }]);
  const removeLine = (idx: number) => {
    if (!canRemoveLine) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const validate = (): string | null => {
    for (const f of headerFields) {
      if (!f.required) continue;
      const v = header[f.name];
      if (v === null || v === undefined || String(v).trim() === "") {
        return `${f.label} is required`;
      }
    }
    if (lines.length === 0) return "At least one line is required";
    for (let i = 0; i < lines.length; i++) {
      const row = lines[i]!;
      for (const c of lineColumns) {
        if (!c.required) continue;
        const v = row[c.key];
        if (v === null || v === undefined || String(v).trim() === "") {
          return `Line ${i + 1}: ${c.label} is required`;
        }
      }
    }
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSaving(true);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...header, lines }),
      });
      const j = await r.json();
      if (!r.ok || j?.success === false) {
        throw new Error(j?.error ?? `Save failed (${r.status})`);
      }
      await onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"
        onClick={() => !saving && onClose()}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-3xl bg-white shadow-2xl flex flex-col z-50">
        {/* Header */}
        <div className="relative flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0 bg-gradient-to-b from-orange-50/40 to-white">
          <span aria-hidden className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600" />
          <div className="flex items-center gap-3">
            <span aria-hidden className="hidden sm:block w-1 h-9 rounded-full bg-gradient-to-b from-orange-500 to-orange-600" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Header + line items. POST submits the full payload.</p>
            </div>
          </div>
          <button
            onClick={() => !saving && onClose()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-orange-700 hover:bg-orange-50 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg text-xs text-rose-700 bg-rose-50 border border-rose-200">
              {error}
            </div>
          )}

          {/* Header fields */}
          <section className="mb-6">
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
              <span aria-hidden className="w-1 h-3 rounded-full bg-gradient-to-b from-orange-400 to-orange-600" />
              Header
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {headerFields.map((f) => (
                <div key={f.name} className={f.width === "half" ? "col-span-1" : "col-span-2"}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {f.label}
                    {f.required && <span className="text-rose-500 ml-0.5">*</span>}
                  </label>
                  <FieldControl
                    field={f}
                    value={header[f.name] ?? ""}
                    onChange={(v) => setHeaderField(f.name, v)}
                  />
                  {f.hint && <p className="text-[11px] text-slate-400 mt-1">{f.hint}</p>}
                </div>
              ))}
            </div>
          </section>

          {/* Optional slot */}
          {beforeLines && <div className="mb-4">{beforeLines}</div>}

          {/* Lines table */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em] flex items-center gap-2">
                <span aria-hidden className="w-1 h-3 rounded-full bg-gradient-to-b from-orange-400 to-orange-600" />
                Lines
                <span className="text-slate-400 font-normal normal-case tracking-normal">({lines.length})</span>
              </h3>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 px-2 py-1 rounded-md hover:bg-orange-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> {addLineLabel}
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {lineColumns.map((c) => (
                        <th
                          key={c.key}
                          style={c.width ? { width: c.width } : undefined}
                          className="px-2.5 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                        >
                          {c.label}
                          {c.required && <span className="text-rose-500 ml-0.5">*</span>}
                        </th>
                      ))}
                      <th className="w-9" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-slate-100 last:border-b-0">
                        {lineColumns.map((c) => (
                          <td key={c.key} className="px-1.5 py-1">
                            <LineCell
                              col={c}
                              value={row[c.key] ?? ""}
                              onChange={(v) => setLineCell(rowIdx, c.key, v)}
                            />
                          </td>
                        ))}
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => removeLine(rowIdx)}
                            disabled={!canRemoveLine}
                            title={canRemoveLine ? "Remove line" : "At least one line required"}
                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 shrink-0 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-brand"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cell renderers ─────────────────────────────────────────────────

const INPUT_BASE =
  "w-full px-2 py-1.5 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent disabled:bg-slate-50";

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: Primitive;
  onChange: (v: Primitive) => void;
}) {
  const v = value ?? "";

  if (field.type === "select") {
    return (
      <select
        value={String(v)}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_BASE}
      >
        <option value="">— Select —</option>
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        value={String(v)}
        onChange={(e) => onChange(applyTransform(field.transform, e.target.value))}
        placeholder={field.placeholder}
        rows={3}
        className={`${INPUT_BASE} resize-none`}
      />
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        value={v === null || v === "" ? "" : String(v)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        placeholder={field.placeholder}
        className={INPUT_BASE}
      />
    );
  }

  if (field.type === "date") {
    return (
      <input
        type="date"
        value={String(v)}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_BASE}
      />
    );
  }

  return (
    <input
      type="text"
      value={String(v)}
      onChange={(e) => onChange(applyTransform(field.transform, e.target.value))}
      placeholder={field.placeholder}
      className={INPUT_BASE}
    />
  );
}

function LineCell({
  col,
  value,
  onChange,
}: {
  col: LineColumn;
  value: Primitive;
  onChange: (v: Primitive) => void;
}) {
  if (col.type === "select") {
    return (
      <select
        value={value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_BASE}
      >
        <option value="">—</option>
        {(col.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (col.type === "number") {
    return (
      <input
        type="number"
        value={value === null || value === "" ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        min={col.min}
        max={col.max}
        step={col.step}
        className={INPUT_BASE}
      />
    );
  }

  if (col.type === "date") {
    return (
      <input
        type="date"
        value={value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_BASE}
      />
    );
  }

  return (
    <input
      type="text"
      value={value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_BASE}
    />
  );
}

function applyTransform(transform: FieldConfig["transform"], v: string): string {
  if (transform === "uppercase") return v.toUpperCase();
  if (transform === "lowercase") return v.toLowerCase();
  return v;
}
