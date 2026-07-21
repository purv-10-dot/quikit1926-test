"use client";

import { useState } from "react";
import { X, ChevronDown, Trash2, Search, Check } from "lucide-react";
import { iconForColumn, isFormulaColumn } from "./field-icons";
import type { FieldEntry } from "./fields-panel";
import type { MemberLite } from "./assignee-cell";
import { memberName } from "./assignee-cell";

export interface FilterRule {
  key: string;
  op: string; // "in" (multi-value) | "eq" | "gte" | "lte" | "contains" | "is_true" | "is_false"
  values: (string | number | boolean)[];
}

/** Fields that can't be filtered (computed / display-only). */
const UNFILTERABLE = new Set(["insights", "comments", "delivery", "summary"]);

function fieldKind(e: FieldEntry): "people" | "options" | "number" | "checkbox" | "text" {
  if (e.key === "assignee" || e.key === "creator") return "people";
  const t = e.field?.type;
  if (t === "DROPDOWN_SINGLE" || t === "DROPDOWN_MULTI" || t === "LABELS") return "options";
  if (t === "NUMBER") return "number";
  if (t === "CHECKBOX") return "checkbox";
  return "text";
}

/**
 * JPD "Filters" side panel. "Choose which ideas show in this view" — a list of
 * filter rules, each a field + a per-type value editor (people checkboxes, option
 * checkboxes, number compare, checkbox true/false, text contains). Add filter /
 * Clear all / remove per row. onChange fires with the full rule list.
 */
export function FilterPanel({
  rules,
  fields,
  members,
  canEdit,
  onChange,
  onClose,
}: {
  rules: FilterRule[];
  fields: FieldEntry[];
  members: MemberLite[];
  canEdit: boolean;
  onChange: (rules: FilterRule[]) => void;
  onClose: () => void;
}) {
  const [fieldPickerFor, setFieldPickerFor] = useState<number | null>(null);
  const [valuePickerFor, setValuePickerFor] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const filterable = fields.filter((f) => !UNFILTERABLE.has(f.key));
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const usedKeys = new Set(rules.map((r) => r.key));

  function pickField(index: number, key: string) {
    const e = byKey.get(key);
    const kind = e ? fieldKind(e) : "text";
    const op = kind === "number" ? "eq" : kind === "checkbox" ? "is_true" : kind === "text" ? "contains" : "in";
    const rule: FilterRule = { key, op, values: [] };
    const next = index >= rules.length ? [...rules, rule] : rules.map((r, i) => (i === index ? rule : r));
    onChange(next);
    setFieldPickerFor(null); setQ("");
  }
  function setValues(index: number, values: FilterRule["values"]) {
    onChange(rules.map((r, i) => (i === index ? { ...r, values } : r)));
  }
  function setOp(index: number, op: string) {
    onChange(rules.map((r, i) => (i === index ? { ...r, op } : r)));
  }
  function removeRule(index: number) { onChange(rules.filter((_, i) => i !== index)); }

  // ── value-editor summary text shown on the collapsed rule ──
  function summary(rule: FilterRule): string {
    const e = byKey.get(rule.key);
    if (!e) return "All";
    const kind = fieldKind(e);
    if (kind === "number") return `${rule.op === "gte" ? "≥" : rule.op === "lte" ? "≤" : "is"} ${rule.values[0] ?? ""}`;
    if (kind === "checkbox") return rule.op === "is_true" ? "is checked" : "is unchecked";
    if (kind === "text") return rule.values[0] ? `contains "${rule.values[0]}"` : "contains…";
    if (rule.values.length === 0) return "All";
    if (kind === "people") {
      const names = rule.values.map((v) => v === "__unassigned__" ? "Unassigned" : (members.find((m) => m.id === v)?.firstName ?? "1"));
      return names.length <= 2 ? names.join(", ") : `${rule.values.length} people`;
    }
    // options
    const labels = rule.values.map((v) => e.field?.options.find((o) => o.value === v)?.label ?? String(v));
    return labels.length <= 2 ? labels.join(", ") : `${rule.values.length} selected`;
  }

  function ValueEditor({ index, rule }: { index: number; rule: FilterRule }) {
    const e = byKey.get(rule.key);
    if (!e) return null;
    const kind = fieldKind(e);

    if (kind === "number") {
      return (
        <div className="mt-1 flex items-center gap-1.5 pl-1">
          <select value={rule.op} onChange={(ev) => setOp(index, ev.target.value)} disabled={!canEdit} className="rounded border border-gray-300 px-1.5 py-1 text-sm">
            <option value="eq">is</option>
            <option value="gte">≥</option>
            <option value="lte">≤</option>
          </select>
          <input
            type="number"
            value={rule.values[0] === undefined ? "" : String(rule.values[0])}
            onChange={(ev) => setValues(index, ev.target.value === "" ? [] : [Number(ev.target.value)])}
            disabled={!canEdit}
            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-400"
          />
        </div>
      );
    }
    if (kind === "checkbox") {
      return (
        <div className="mt-1 flex items-center gap-2 pl-1 text-sm">
          <label className="flex items-center gap-1"><input type="radio" checked={rule.op === "is_true"} onChange={() => setOp(index, "is_true")} disabled={!canEdit} /> Checked</label>
          <label className="flex items-center gap-1"><input type="radio" checked={rule.op === "is_false"} onChange={() => setOp(index, "is_false")} disabled={!canEdit} /> Unchecked</label>
        </div>
      );
    }
    if (kind === "text") {
      return (
        <input
          value={String(rule.values[0] ?? "")}
          onChange={(ev) => setValues(index, ev.target.value ? [ev.target.value] : [])}
          disabled={!canEdit}
          placeholder="Contains…"
          className="mt-1 ml-1 w-[calc(100%-4px)] rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-400"
        />
      );
    }
    // people / options → checkbox list popover
    const open = valuePickerFor === index;
    const opts: { value: string; label: string }[] =
      kind === "people"
        ? [{ value: "__unassigned__", label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: memberName(m) }))]
        : (e.field?.options ?? []).filter((o) => o.isActive).map((o) => ({ value: o.value, label: o.label }));
    const filteredOpts = q ? opts.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : opts;
    const toggle = (v: string) => {
      const has = rule.values.includes(v);
      setValues(index, has ? rule.values.filter((x) => x !== v) : [...rule.values, v]);
    };
    return (
      <div className="relative mt-1 pl-1">
        <button type="button" disabled={!canEdit} onClick={() => { setValuePickerFor(open ? null : index); setQ(""); }} className="flex w-full items-center justify-between rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <span className="truncate">{rule.values.length ? summary(rule) : "Any"}</span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
                <input autoFocus value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search" className="w-full rounded border border-gray-200 py-1 pl-7 pr-2 text-sm outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filteredOpts.map((o) => {
                const on = rule.values.includes(o.value);
                return (
                  <button key={o.value} type="button" onClick={() => toggle(o.value)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"}`}>{on && <Check className="h-3 w-3" />}</span>
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })}
              {filteredOpts.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No options</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  function FieldPicker({ index, selectedKey }: { index: number; selectedKey?: string }) {
    const sel = selectedKey ? byKey.get(selectedKey) : undefined;
    const open = fieldPickerFor === index;
    const pickable = filterable.filter((f) => (q ? f.label.toLowerCase().includes(q.toLowerCase()) : true));
    return (
      <div className="relative flex-1">
        <button type="button" disabled={!canEdit} onClick={() => { setFieldPickerFor(open ? null : index); setValuePickerFor(null); setQ(""); }} className="flex w-full items-center justify-between gap-1 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50">
          <span className="flex min-w-0 items-center gap-1.5">
            {sel && (isFormulaColumn(sel.field) ? <span className="w-4 text-center font-serif text-[13px] italic text-gray-500">fx</span> : (() => { const I = iconForColumn(sel.key, sel.field); return <I className="h-3.5 w-3.5 text-gray-500" />; })())}
            <span className="truncate">{sel ? sel.label : "Select a field"}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fields" className="w-full rounded border border-gray-200 py-1 pl-7 pr-2 text-sm outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {pickable.map((f) => {
                const disabled = usedKeys.has(f.key) && f.key !== selectedKey;
                const I = iconForColumn(f.key, f.field);
                return (
                  <button key={f.key} type="button" disabled={disabled} onClick={() => pickField(index, f.key)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-default disabled:text-gray-300">
                    {isFormulaColumn(f.field) ? <span className="w-4 text-center font-serif text-[13px] italic text-gray-500">fx</span> : <I className="h-4 w-4 shrink-0 text-gray-500" />}
                    {f.label}
                  </button>
                );
              })}
              {pickable.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No fields</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-[55] flex w-[440px] max-w-[92vw] flex-col border-l border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">Choose which ideas show in this view</p>

        <div className="space-y-3">
          {rules.map((r, i) => (
            <div key={i} className="rounded border border-gray-200 p-2">
              <div className="flex items-center gap-2">
                <FieldPicker index={i} selectedKey={r.key} />
                <button type="button" disabled={!canEdit} onClick={() => removeRule(i)} aria-label="Remove filter" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <ValueEditor index={i} rule={r} />
            </div>
          ))}

          {canEdit && rules.length < filterable.length && (
            <div className="rounded border border-dashed border-gray-300 p-2">
              <FieldPicker index={rules.length} />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-4">
          {rules.length > 0 && (
            <button type="button" disabled={!canEdit} onClick={() => onChange([])} className="text-sm text-blue-600 hover:underline disabled:opacity-50">
              Clear all
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
