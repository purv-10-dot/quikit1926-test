"use client";

import { Input } from "@/components/ui/input";
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown";
import { Select } from "@/components/ui/select";
import {
  getRequirementFields,
  LEAD_TECHNOLOGY_OPTIONS,
  type RequirementDetails,
} from "@/lib/leads/lead-type-config";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-crm-text">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[11px] text-red-600">{error}</span> : null}
    </label>
  );
}

export function LeadRequirementFields({
  leadType,
  values,
  errors,
  onChange,
}: {
  leadType: string;
  values: RequirementDetails;
  errors: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
}) {
  const fields = getRequirementFields(leadType);
  if (!leadType || fields.length === 0) {
    return (
      <p className="text-sm text-crm-muted">Select a type of lead to configure requirement details.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {fields.map((field) => {
        const err = errors[`req.${field.key}`];
        const label = `${field.label}${field.required ? " *" : ""}`;
        const raw = values[field.key];

        if (field.kind === "technology") {
          const selected = Array.isArray(raw) ? (raw as string[]) : [];
          return (
            <Field key={field.key} label={label} error={err}>
              <MultiSelectDropdown
                options={LEAD_TECHNOLOGY_OPTIONS}
                value={selected}
                onChange={(next) => onChange(field.key, next)}
                placeholder="— Select technology —"
                invalid={!!err}
              />
            </Field>
          );
        }

        if (field.kind === "textarea") {
          return (
            <div key={field.key} className={field.key.includes("Description") ? "md:col-span-2" : undefined}>
              <Field label={label} error={err}>
                <textarea
                  className="crm-input min-h-[80px]"
                  value={typeof raw === "string" ? raw : ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                />
              </Field>
            </div>
          );
        }

        if (field.kind === "select" && field.options) {
          return (
            <Field key={field.key} label={label} error={err}>
              <Select
                value={typeof raw === "string" ? raw : ""}
                onChange={(e) => onChange(field.key, e.target.value)}
              >
                <option value="">— Select —</option>
                {field.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </Field>
          );
        }

        if (field.kind === "number") {
          return (
            <Field key={field.key} label={label} error={err}>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={raw != null && raw !== "" ? String(raw) : ""}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            </Field>
          );
        }

        return (
          <Field key={field.key} label={label} error={err}>
            <Input
              value={typeof raw === "string" ? raw : ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
          </Field>
        );
      })}
    </div>
  );
}
