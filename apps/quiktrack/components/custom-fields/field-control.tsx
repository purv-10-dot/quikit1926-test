"use client";

import { useState } from "react";
import { X, AlertCircle } from "lucide-react";
import type { CustomFieldDTO } from "@/lib/services/customFields";
import type { FieldValue } from "@/lib/customFields/registry";
import { validateFieldValue } from "@/lib/validation/customField";
import { BoardFilterSelect } from "@/app/(dashboard)/spaces/[id]/board/_components/board-filter-select";

export interface MemberOption {
  id: string;
  label: string;
}

interface Props {
  field: CustomFieldDTO;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  /** Required for USER_PICKER fields. */
  members?: MemberOption[];
  disabled?: boolean;
  autoFocus?: boolean;
  /** Show inline validation (red border + message) once the field is touched.
   *  On for the issue form; off for the admin default-value editor. */
  validate?: boolean;
  /** Force the validation message to show even if the field hasn't been
   *  touched yet (e.g. the user hit "Create" with an invalid value). */
  forceShowError?: boolean;
  /** "inline" drops the box border so the control blends into the issue
   *  Details panel (border appears on hover/focus, like the built-in rows).
   *  Default "boxed" keeps the bordered look used by the create form. */
  inline?: boolean;
}

const INPUT_BOXED =
  "w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400";
const INPUT_INLINE =
  "w-full px-2 -mx-2 py-1 text-sm bg-transparent border border-transparent rounded hover:bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-500 disabled:text-gray-400 disabled:hover:bg-transparent";

/**
 * Renders the value input for any custom field type. Used in the admin
 * default-value editor and on issue create/edit forms. Controlled component.
 */
export function FieldControl({ field, value, onChange, members = [], disabled, autoFocus, validate, forceShowError, inline }: Props) {
  const INPUT = inline ? INPUT_INLINE : INPUT_BOXED;
  const TEXTAREA = inline
    ? "w-full px-2 -mx-2 py-1 text-sm bg-transparent border border-transparent rounded hover:bg-gray-50 focus:bg-white focus:outline-none focus:border-blue-500 resize-y disabled:text-gray-400 disabled:hover:bg-transparent"
    : "w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y disabled:bg-gray-50";
  const activeOptions = field.options.filter((o) => o.isActive);
  const [touched, setTouched] = useState(false);
  const result = validate && (touched || forceShowError) ? validateFieldValue(field, value) : null;
  // Show a message about the value itself, not "<field name> must be …" — the
  // label is right above the input, so repeating the name is noise.
  const err = (() => {
    if (!result || result.ok) return null;
    if (result.error?.includes("is required")) return "This field is required.";
    switch (field.type) {
      case "URL":
        return "Enter a valid URL.";
      case "DATE":
        return "Enter a valid date.";
      case "NUMBER":
        return "Enter a valid number.";
      case "DROPDOWN_SINGLE":
      case "DROPDOWN_MULTI":
        return "Select a valid option from the list.";
      default:
        return result.error ?? "Invalid value.";
    }
  })();

  const control = (() => {
    switch (field.type) {
    case "LONG_TEXT":
      return (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          disabled={disabled}
          autoFocus={autoFocus}
          rows={3}
          maxLength={50_000}
          className={TEXTAREA}
        />
      );

    case "NUMBER":
      return (
        <input
          type="number"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder={field.placeholder ?? ""}
          disabled={disabled}
          autoFocus={autoFocus}
          className={INPUT}
        />
      );

    case "DATE":
      return (
        <input
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
          autoFocus={autoFocus}
          className={INPUT}
        />
      );

    case "CHECKBOX":
      return (
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {field.placeholder || "Yes"}
        </label>
      );

    case "URL":
      return (
        <input
          type="url"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? "https://"}
          disabled={disabled}
          autoFocus={autoFocus}
          className={INPUT}
        />
      );

    case "DROPDOWN_SINGLE": {
      const ph = field.placeholder || "— Select —";
      if (disabled) {
        const sel = activeOptions.find((o) => o.value === value);
        return <div className={`${INPUT} bg-gray-50 text-gray-400 flex items-center`}>{sel?.label ?? ph}</div>;
      }
      return (
        <BoardFilterSelect
          value={(value as string) ?? ""}
          onChange={(v) => onChange(v || null)}
          searchable
          inline={inline}
          placeholder={ph}
          options={[{ value: "", label: ph }, ...activeOptions.map((o) => ({ value: o.value, label: o.label }))]}
        />
      );
    }

    case "USER_PICKER": {
      const unassigned = field.placeholder || "— Unassigned —";
      // BoardFilterSelect has no disabled state, so render a read-only box when
      // the field is locked (e.g. no edit permission).
      if (disabled) {
        const sel = members.find((m) => m.id === value);
        return (
          <div className={`${INPUT} bg-gray-50 text-gray-400 flex items-center`}>{sel?.label ?? unassigned}</div>
        );
      }
      return (
        <BoardFilterSelect
          value={(value as string) ?? ""}
          onChange={(v) => onChange(v || null)}
          searchable
          inline={inline}
          placeholder={unassigned}
          options={[{ value: "", label: unassigned }, ...members.map((m) => ({ value: m.id, label: m.label }))]}
        />
      );
    }

    case "DROPDOWN_MULTI":
      return (
        <CheckboxGroup
          options={activeOptions.map((o) => ({ value: o.value, label: o.label }))}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          disabled={disabled}
        />
      );

    case "LABELS":
      return (
        <TagInput
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          placeholder={field.placeholder ?? "Add a label and press Enter"}
          disabled={disabled}
        />
      );

    case "SHORT_TEXT":
    default:
      return (
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          disabled={disabled}
          autoFocus={autoFocus}
          maxLength={1000}
          className={INPUT}
        />
      );
    }
  })();

  return (
    <div
      onBlur={() => setTouched(true)}
      className={
        err
          ? "[&_input]:!border-red-500 [&_select]:!border-red-500 [&_textarea]:!border-red-500"
          : undefined
      }
    >
      {control}
      {err && (
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {err}
        </p>
      )}
    </div>
  );
}

function CheckboxGroup({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => toggle(o.value)}
            className={`px-2.5 h-7 text-xs rounded-full border ${
              on
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            } disabled:opacity-50`}
          >
            {o.label}
          </button>
        );
      })}
      {options.length === 0 && <span className="text-xs text-gray-400">No options.</span>}
    </div>
  );
}

function TagInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const t = draft.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  }
  return (
    <div className="w-full min-h-9 px-2 py-1.5 flex flex-wrap items-center gap-1.5 border border-gray-300 rounded focus-within:ring-2 focus-within:ring-blue-500">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 px-2 h-6 text-xs rounded-full bg-gray-100 text-gray-700">
          {t}
          {!disabled && (
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="text-gray-400 hover:text-gray-600">
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        disabled={disabled}
        className="flex-1 min-w-[80px] h-6 text-sm bg-transparent focus:outline-none"
      />
    </div>
  );
}
