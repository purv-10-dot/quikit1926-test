"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { IdeaValueCell } from "./idea-value-cell";
import { K, type FieldDef, type IdeaRow, type IdeaStatus, type IdeaFieldValue } from "./ideas-types";

/**
 * Idea detail side panel. Shows the idea's fields; the seeded scoring/attribute
 * fields are editable inline (Score is read-only and recomputed server-side on
 * save). Saving PATCHes the idea and invalidates the list so the Table — and the
 * Score column — refresh.
 */
export function IdeaDetailPanel({
  projectId,
  idea,
  fields,
  statuses,
  onClose,
}: {
  projectId: string;
  idea: IdeaRow;
  fields: FieldDef[];
  statuses: IdeaStatus[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, IdeaFieldValue>>(idea.values);
  const [saving, setSaving] = useState(false);
  const status = statuses.find((s) => s.id === idea.statusId);

  async function save(fieldId: string, value: IdeaFieldValue) {
    setValues((v) => ({ ...v, [fieldId]: value }));
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: { [fieldId]: value } }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: { values?: Record<string, IdeaFieldValue> } };
        if (json.data?.values) setValues(json.data.values); // includes recomputed Score
        await qc.invalidateQueries({ queryKey: ["quiktrack", "ideas", projectId] });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="w-96 flex-shrink-0 overflow-y-auto border-l border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <span className="text-xs font-medium text-gray-500">{idea.key}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-gray-100">
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      <div className="px-4 py-3">
        <h3 className="text-base font-semibold text-gray-900">{idea.title}</h3>
        {status && (
          <span
            className="mt-2 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: status.color }}
          >
            {status.name}
          </span>
        )}
        {idea.description && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600">{idea.description}</p>
        )}
      </div>

      <div className="space-y-3 px-4 pb-6">
        {fields.map((field) => (
          <div key={field.id} className="grid grid-cols-[120px_1fr] items-center gap-2">
            <span className="text-xs font-medium text-gray-500">{field.name}</span>
            {field.key === K.score ? (
              <IdeaValueCell field={field} value={values[field.id] ?? null} />
            ) : (
              <FieldEditor field={field} value={values[field.id] ?? null} disabled={saving} onSave={save} />
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

function FieldEditor({
  field,
  value,
  disabled,
  onSave,
}: {
  field: FieldDef;
  value: IdeaFieldValue;
  disabled: boolean;
  onSave: (fieldId: string, value: IdeaFieldValue) => void;
}) {
  const base = "w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none";

  if (field.type === "DROPDOWN_SINGLE") {
    return (
      <select
        className={base}
        disabled={disabled}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onSave(field.id, e.target.value || null)}
      >
        <option value="">—</option>
        {field.options.filter((o) => o.isActive).map((o) => (
          <option key={o.id} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === "NUMBER") {
    return (
      <input
        type="number"
        className={base}
        disabled={disabled}
        defaultValue={value === null || value === undefined ? "" : String(value)}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          onSave(field.id, raw === "" ? null : Number(raw));
        }}
      />
    );
  }

  return (
    <input
      type="text"
      className={base}
      disabled={disabled}
      defaultValue={value === null || value === undefined ? "" : String(value)}
      onBlur={(e) => onSave(field.id, e.target.value.trim() || null)}
    />
  );
}
