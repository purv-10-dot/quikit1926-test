"use client";

import { DynamicFieldInput } from "@/components/leads/dynamic-field-input";
import { toLeadDefShape } from "@/lib/services/activity-types/field-shape";
import type { ActivityFieldDefinition } from "@/types/activity-type";

/**
 * Multi-field wrapper for the activity logging UX. Renders an activity type's
 * custom fields by delegating each control to the shared DynamicFieldInput
 * (the proven lead/product component) via the shared toLeadDefShape mapper —
 * NO re-implemented control mapping. Owns the values-map ({ key: value }) and
 * reports it up on every change.
 *
 * Phone is filtered out: it's excluded for activities (the type list won't
 * contain it post-P2.3, and writeActivityFieldValues throws on it), so the
 * wrapper defensively never renders a Phone control.
 */
export function ActivityFieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: ActivityFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const renderable = fields.filter((f) => f.fieldType !== "Phone");

  function setValue(key: string, next: unknown) {
    onChange({ ...values, [key]: next });
  }

  if (renderable.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4">
      {renderable.map((f) => {
        const required = f.requirement === "Required";
        return (
          <label key={f.key} className="block text-sm">
            <span className="mb-1 block font-medium text-crm-text">
              {f.label}
              {required && <span className="text-red-600"> *</span>}
            </span>
            <DynamicFieldInput
              def={toLeadDefShape(f)}
              value={values[f.key]}
              onChange={(next) => setValue(f.key, next)}
            />
            {f.helpText && <span className="mt-1 block text-[11px] text-crm-muted">{f.helpText}</span>}
          </label>
        );
      })}
    </div>
  );
}
