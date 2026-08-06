"use client";

/**
 * FR-RE — shared rendering of the custom (non-protected) disposition fields:
 * unassigned fields flat, then each non-protected tab's fields, with a
 * rule-driven tab's group appearing only when a rule revealed it (show_tab) and
 * each field gated by fieldVisible (show_field / defaultVisibility).
 *
 * Extracted verbatim from call-disposition-modal so the clean FR-RE view and the
 * legacy fallback render through ONE implementation (extract-and-reuse). Pure
 * visibility logic lives in lib/services/forms/field-visibility.
 */
import { useEffect, useState } from "react";
import { fieldVisible, tabVisible } from "@/lib/services/forms/field-visibility";
import type { RuleDecision } from "@/lib/services/forms/form-rule-evaluator";

export interface FrreFieldOption {
  valueKey: string;
  label: string;
}
export interface FrreField {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isProtected: boolean;
  requiredLevel: string;
  formTabId: string | null;
  defaultVisibility: string;
  options: FrreFieldOption[];
  userPickerMode?: "single" | "multi" | null;
  userPickerScope?: "all_users" | "team" | "role" | null;
}
export interface FrreTab {
  id: string;
  name: string;
  visibility: string;
  isProtected: boolean;
  sortOrder: number;
}

/** Mandatory = hard requiredLevel OR a make_mandatory rule fired for the field. */
export function frreFieldMandatory(field: FrreField, decision: RuleDecision | null): boolean {
  return field.requiredLevel === "hard" || decision?.fieldRequirement[field.fieldKey] === "mandatory";
}

export function DispositionFieldGroups({
  fields,
  tabs,
  decision,
  values,
  onChange,
}: {
  fields: FrreField[];
  tabs: FrreTab[];
  decision: RuleDecision | null;
  values: Record<string, string | string[]>;
  onChange: (fieldKey: string, value: string | string[]) => void;
}) {
  const nonProtected = fields.filter((f) => !f.isProtected);
  const unassigned = nonProtected.filter((f) => !f.formTabId);
  const customTabs = [...tabs].filter((t) => !t.isProtected).sort((a, b) => a.sortOrder - b.sortOrder);

  function renderField(f: FrreField) {
    // String-typed fields read a string from the widened map (a user_picker value
    // may be string[], but those render via UserPickerControl, not here).
    const raw = values[f.fieldKey];
    const strValue = typeof raw === "string" ? raw : "";
    return (
      <label key={f.id} className="text-sm font-medium text-crm-text">
        {f.label} {frreFieldMandatory(f, decision) ? <span className="text-red-600">*</span> : null}
        {f.fieldType === "user_picker" ? (
          <UserPickerControl field={f} value={raw} onChange={(v) => onChange(f.fieldKey, v)} />
        ) : f.fieldType === "dropdown" ? (
          <select
            className="crm-input mt-1"
            value={strValue}
            onChange={(e) => onChange(f.fieldKey, e.target.value)}
          >
            <option value="">Select {f.label}</option>
            {f.options.map((o) => (
              <option key={o.valueKey} value={o.valueKey}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={f.fieldType === "number" ? "number" : f.fieldType === "datetime" ? "datetime-local" : "text"}
            className="crm-input mt-1"
            value={strValue}
            onChange={(e) => onChange(f.fieldKey, e.target.value)}
          />
        )}
      </label>
    );
  }

  return (
    <>
      {unassigned.filter((f) => fieldVisible(f, decision)).map(renderField)}
      {customTabs
        .filter((t) => tabVisible(t, decision))
        .map((tab) => {
          const tabFields = nonProtected.filter((f) => f.formTabId === tab.id && fieldVisible(f, decision));
          if (tabFields.length === 0) return null;
          return (
            <div key={tab.id} className="sm:col-span-2">
              <p className="mb-2 mt-1 text-xs font-semibold uppercase tracking-wide text-crm-muted">{tab.name}</p>
              <div className="grid gap-3 sm:grid-cols-2">{tabFields.map(renderField)}</div>
            </div>
          );
        })}
    </>
  );
}

/**
 * user_picker control — RBAC-scoped user list from GET /api/forms/user-picker
 * (scope from the field config). Single mode -> a <select> storing one id (string);
 * multi mode -> a checkbox list storing string[]. The value shape (string vs
 * string[]) is what survives to CrmFieldValue.valueUserIds via the widened
 * field-values pipeline.
 */
function UserPickerControl({
  field,
  value,
  onChange,
}: {
  field: FrreField;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  const [options, setOptions] = useState<{ id: string; name: string; email: string }[]>([]);
  const scope = field.userPickerScope ?? "all_users";
  const isMulti = field.userPickerMode === "multi";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/forms/user-picker?scope=${encodeURIComponent(scope)}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!cancelled && res.ok) setOptions(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (!cancelled) setOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  if (isMulti) {
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-crm-border p-2">
        {options.length === 0 ? (
          <p className="px-1 py-1 text-xs text-crm-muted">No users available.</p>
        ) : (
          options.map((u) => (
            <label key={u.id} className="flex items-center gap-2 px-1 py-1 text-sm font-normal text-crm-text">
              <input
                type="checkbox"
                checked={selected.includes(u.id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selected, u.id] : selected.filter((id) => id !== u.id))
                }
              />
              {u.name || u.email}
            </label>
          ))
        )}
      </div>
    );
  }

  const single = typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
  return (
    <select className="crm-input mt-1" value={single} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select user</option>
      {options.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name || u.email}
        </option>
      ))}
    </select>
  );
}
