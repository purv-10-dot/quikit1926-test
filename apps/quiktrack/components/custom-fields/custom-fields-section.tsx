"use client";

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
  forceShowErrors,
}: Props) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div
          key={field.id}
          className={
            variant === "detail"
              ? "grid grid-cols-[160px_1fr] items-center gap-3 text-sm py-0.5"
              : ""
          }
        >
          <label
            className={`block ${
              variant === "form"
                ? "text-xs font-semibold text-gray-700 mb-1"
                : "text-sm text-gray-500 whitespace-nowrap"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {field.name}
              {field.isRequired && <span className="text-red-500">*</span>}
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
              inline={variant === "detail"}
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
