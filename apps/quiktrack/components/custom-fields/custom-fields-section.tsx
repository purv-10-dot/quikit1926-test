"use client";

import { Globe } from "lucide-react";
import type { CustomFieldDTO } from "@/lib/services/customFields";
import type { FieldValue } from "@/lib/customFields/registry";
import { FieldControl, type MemberOption } from "./field-control";

interface Props {
  fields: CustomFieldDTO[];
  values: Record<string, FieldValue>;
  onChange: (fieldId: string, value: FieldValue) => void;
  members?: MemberOption[];
  disabled?: boolean;
  /** "form" = stacked labels (create modal); "detail" = compact (issue panel). */
  variant?: "form" | "detail";
  title?: string;
  /** Force every field's validation message to show (e.g. after a failed submit). */
  forceShowErrors?: boolean;
}

/**
 * Renders the active custom fields for an issue (global first with a badge,
 * then space fields — ordering decided server-side). Shared by the create
 * modal and the issue detail panel. Controlled: the parent owns `values`.
 */
export function CustomFieldsSection({
  fields,
  values,
  onChange,
  members = [],
  disabled,
  variant = "form",
  title = "Custom fields",
  forceShowErrors,
}: Props) {
  if (fields.length === 0) return null;

  return (
    <div className={variant === "form" ? "space-y-3" : "space-y-2.5"}>
      {variant === "form" && (
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide pt-1">{title}</h4>
      )}
      {fields.map((field) => (
        <div key={field.id} className={variant === "detail" ? "grid grid-cols-[120px_1fr] items-start gap-2" : ""}>
          <label className={`block text-xs font-semibold text-gray-700 ${variant === "form" ? "mb-1" : "pt-2"}`}>
            <span className="inline-flex items-center gap-1.5">
              {field.name}
              {field.isRequired && <span className="text-red-500">*</span>}
              {field.scope === "global" && (
                <span
                  title="Global field"
                  className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5"
                >
                  <Globe className="h-2.5 w-2.5" /> Global
                </span>
              )}
            </span>
          </label>
          <div className="min-w-0">
            <FieldControl
              field={field}
              value={values[field.id] ?? null}
              onChange={(v) => onChange(field.id, v)}
              members={members}
              disabled={disabled}
              validate
              forceShowError={forceShowErrors}
            />
            {field.helpText && <p className="mt-1 text-[11px] text-gray-400">{field.helpText}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Build the initial value map from field defaults (used when opening a create form). */
export function defaultValuesFor(fields: CustomFieldDTO[]): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const f of fields) {
    if (f.defaultValue !== null && f.defaultValue !== undefined) {
      out[f.id] = f.defaultValue as FieldValue;
    }
  }
  return out;
}
