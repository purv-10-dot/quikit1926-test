"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown";
import { PhoneField, emptyPhoneValue, type PhoneValue } from "@/components/leads/phone-field";
import type { LeadFieldDefinition } from "@/types/field-definition";

/**
 * Renders the appropriate input element for a custom field definition.
 * Used inside LeadForm; the parent component owns the value state.
 */
export function DynamicFieldInput({
  def,
  value,
  onChange,
}: {
  def: LeadFieldDefinition;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  switch (def.fieldType) {
    case "TextArea":
      return (
        <textarea
          className="crm-input min-h-[80px]"
          name={def.key}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.helpText ?? undefined}
        />
      );
    case "Number":
      return (
        <Input
          type="number"
          name={def.key}
          value={typeof value === "number" || typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "Email":
      return (
        <Input type="email" name={def.key} value={asString(value)} onChange={(e) => onChange(e.target.value)} />
      );
    case "Phone": {
      const v = isPhoneValue(value) ? value : emptyPhoneValue();
      return <PhoneField value={v} onChange={(next) => onChange(next)} ariaLabel={def.label} />;
    }
    case "Date":
      return (
        <Input
          type="date"
          name={def.key}
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "Boolean":
      return (
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name={def.key}
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          {def.label}
        </label>
      );
    case "Select":
      return (
        <Select name={def.key} value={asString(value)} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {def.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    case "MultiSelect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      // Checkbox dropdown (Build 3) — replaces the native <select multiple>
      // that required ctrl/cmd-click. Reuses the shared MultiSelectDropdown so
      // create-lead custom MultiSelect fields (e.g. Accounting Software) tick
      // like normal checkboxes.
      return (
        <MultiSelectDropdown
          options={def.options ?? []}
          value={arr}
          onChange={(next) => onChange(next)}
          placeholder={def.helpText ?? "— Select —"}
        />
      );
    }
    default:
      return (
        <Input name={def.key} value={asString(value)} onChange={(e) => onChange(e.target.value)} />
      );
  }
}

function asString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

function isPhoneValue(v: unknown): v is PhoneValue {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as PhoneValue).countryIso2 === "string" &&
    typeof (v as PhoneValue).dialCode === "string" &&
    typeof (v as PhoneValue).number === "string"
  );
}
