"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { K, THEME_META, ROADMAP_STYLES, optionLabel, type FieldDef, type IdeaFieldValue } from "./ideas-types";

/**
 * Editable + read-only field controls for the idea detail panel. Each control
 * matches its custom-field type (dropdown / multi / number / rating / date /
 * checkbox / text) and PATCHes on change via `onSave`. Split out of
 * idea-detail-panel.tsx to keep that file under the 300-line ceiling.
 */

/** Collapsible section with an OPTIONAL internal max-height scroll (JPD). */
export function Accordion({
  title,
  defaultOpen = true,
  right,
  scroll = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  scroll?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-t-md bg-gray-50 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
      >
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="flex-1">{title}</span>
        {right}
      </button>
      {open && (
        // Per-accordion internal scroll AND the panel itself scrolls — both, per
        // the JPD reference. Each section caps at ~18rem then scrolls.
        <div className={`px-3 py-2 ${scroll ? "max-h-72 overflow-y-auto" : ""}`}>{children}</div>
      )}
    </div>
  );
}

/** A single labelled field row (label left, control right). */
export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-center gap-2 py-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="min-w-0 text-sm text-gray-800">{children}</div>
    </div>
  );
}

const inputBase =
  "w-full rounded border border-transparent px-1.5 py-1 text-sm hover:border-gray-200 focus:border-blue-400 focus:outline-none";

/** Rating dots (1–5) — click a dot to set the value. Colour by field. */
function RatingEditor({ field, value, onSave }: EditorProps) {
  const max = 5;
  const n = typeof value === "number" ? value : 0;
  const fill =
    field.key === K.impact ? "bg-blue-400" :
    field.key === K.effort ? "bg-red-400" :
    field.key === K.value ? "bg-purple-400" : "bg-amber-400";
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => {
        const on = i < n;
        return (
          <button
            key={i}
            type="button"
            aria-label={`Set ${field.name} to ${i + 1}`}
            onClick={() => onSave(field.id, i + 1 === n ? null : i + 1)}
            className="grid h-3.5 w-3.5 place-items-center"
          >
            <span className={`rounded-full ${on ? `h-2.5 w-2.5 ${fill}` : "h-1 w-1 bg-gray-300"}`} />
          </button>
        );
      })}
    </div>
  );
}

interface EditorProps {
  field: FieldDef;
  value: IdeaFieldValue;
  disabled?: boolean;
  onSave: (fieldId: string, value: IdeaFieldValue) => void;
}

/** The right control for a field, chosen by type/key. */
export function FieldEditor({ field, value, disabled, onSave }: EditorProps) {
  // Rating-style numbers (impact/effort/value) show dots; other numbers a box.
  if (field.type === "NUMBER" && (field.key === K.impact || field.key === K.effort || field.key === K.value)) {
    return <RatingEditor field={field} value={value} onSave={onSave} />;
  }

  if (field.type === "DROPDOWN_SINGLE") {
    const v = typeof value === "string" ? value : "";
    // Theme + Roadmap render as their branded chips (read shows chip, edit via select).
    return (
      <div className="relative">
        <select
          className={`${inputBase} appearance-none pr-6`}
          disabled={disabled}
          value={v}
          onChange={(e) => onSave(field.id, e.target.value || null)}
        >
          <option value="">None</option>
          {field.options.filter((o) => o.isActive).map((o) => (
            <option key={o.id} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
      </div>
    );
  }

  if (field.type === "DROPDOWN_MULTI") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap items-center gap-1">
        {arr.length === 0 && <span className="text-gray-400">None</span>}
        {arr.map((val) => (
          <span key={val} className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
            {optionLabel(field, val)}
            <button type="button" aria-label={`Remove ${val}`} className="text-blue-400 hover:text-blue-700" onClick={() => onSave(field.id, arr.filter((x) => x !== val))}>×</button>
          </span>
        ))}
        <select
          className="rounded border border-transparent px-1 py-0.5 text-xs text-gray-400 hover:border-gray-200 focus:border-blue-400 focus:outline-none"
          value=""
          disabled={disabled}
          onChange={(e) => { const val = e.target.value; if (val && !arr.includes(val)) onSave(field.id, [...arr, val]); }}
        >
          <option value="">+ Add</option>
          {field.options.filter((o) => o.isActive && !arr.includes(o.value)).map((o) => (
            <option key={o.id} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "CHECKBOX") {
    return (
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-gray-300 text-blue-600"
        disabled={disabled}
        checked={value === true}
        onChange={(e) => onSave(field.id, e.target.checked)}
      />
    );
  }

  if (field.type === "DATE") {
    return (
      <input
        type="date"
        className={inputBase}
        disabled={disabled}
        defaultValue={typeof value === "string" ? value : ""}
        onBlur={(e) => onSave(field.id, e.target.value || null)}
      />
    );
  }

  if (field.type === "NUMBER") {
    return (
      <input
        type="number"
        className={inputBase}
        disabled={disabled}
        defaultValue={value === null || value === undefined ? "" : String(value)}
        onBlur={(e) => { const raw = e.target.value.trim(); onSave(field.id, raw === "" ? null : Number(raw)); }}
      />
    );
  }

  // SHORT_TEXT / LONG_TEXT / URL / everything else.
  return (
    <input
      type="text"
      className={inputBase}
      disabled={disabled}
      placeholder="None"
      defaultValue={value === null || value === undefined ? "" : String(value)}
      onBlur={(e) => onSave(field.id, e.target.value.trim() || null)}
    />
  );
}

/** Read-only chip renderers used for Theme / Roadmap in the read state. */
export function FieldChip({ field, value }: { field: FieldDef; value: IdeaFieldValue }) {
  if (field.key === K.theme && typeof value === "string" && value) {
    const meta = THEME_META[value];
    return (
      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[13px] font-medium ${meta?.bg ?? "bg-blue-50"} ${meta?.text ?? "text-blue-700"}`}>
        {meta?.emoji} {optionLabel(field, value)}
      </span>
    );
  }
  if (field.key === K.roadmap && typeof value === "string" && value) {
    return (
      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${ROADMAP_STYLES[value] ?? "bg-gray-100 text-gray-600"}`}>
        {optionLabel(field, value)}
      </span>
    );
  }
  return null;
}
