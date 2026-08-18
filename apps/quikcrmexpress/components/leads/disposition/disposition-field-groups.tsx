"use client";

/**
 * FR-RE — shared rendering primitives for the custom (non-protected) disposition
 * fields, plus the tabbing helpers the clean form uses to build ONE top tab-bar.
 *
 * Layout (2026-08-06): the whole disposition modal is a tabbed interface owned by
 * CleanDispositionForm — tab 1 is "Call Disposition" (the main form) and each
 * rule-revealed custom tab follows it, auto-focused when a rule reveals it. This
 * module exposes:
 *   - <DispositionField>       — render one field (dropdown / user_picker / input)
 *   - useVisibleDispositionTabs — the ordered list of rule-revealed tabs (with ≥1
 *                                 visible field) + the unassigned-field list
 *   - fieldsForTab / unassignedFields — field selectors gated by fieldVisible
 *   - frreFieldMandatory
 *
 * Pure visibility logic lives in lib/services/forms/field-visibility.
 */
import { useMemo } from "react";
import { fieldVisible, tabVisible } from "@/lib/services/forms/field-visibility";
import type { RuleDecision } from "@/lib/services/forms/form-rule-evaluator";
import { UserPickerControl } from "@/components/leads/disposition/user-picker-control";

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

/** Non-protected, currently-visible fields that belong to a given tab. */
export function fieldsForTab(
  fields: FrreField[],
  tabId: string,
  decision: RuleDecision | null,
): FrreField[] {
  return fields.filter((f) => !f.isProtected && f.formTabId === tabId && fieldVisible(f, decision));
}

/** Non-protected, currently-visible fields not assigned to any tab. */
export function unassignedFields(fields: FrreField[], decision: RuleDecision | null): FrreField[] {
  return fields.filter((f) => !f.isProtected && !f.formTabId && fieldVisible(f, decision));
}

/**
 * The ordered custom tabs that should appear in the tab-bar: revealed by a rule
 * (or default-visible) AND holding at least one currently-visible field. Recomputes
 * as the decision changes so a rule that reveals a tab makes it appear.
 */
export function useVisibleDispositionTabs(
  fields: FrreField[],
  tabs: FrreTab[],
  decision: RuleDecision | null,
): FrreTab[] {
  return useMemo(() => {
    const custom = [...tabs].filter((t) => !t.isProtected).sort((a, b) => a.sortOrder - b.sortOrder);
    return custom
      .filter((t) => tabVisible(t, decision))
      .filter((t) => fields.some((f) => !f.isProtected && f.formTabId === t.id && fieldVisible(f, decision)));
  }, [fields, tabs, decision]);
}

/** Render a single disposition field (dropdown / user_picker / typed input). */
export function DispositionField({
  field: f,
  decision,
  values,
  onChange,
}: {
  field: FrreField;
  decision: RuleDecision | null;
  values: Record<string, string | string[]>;
  onChange: (fieldKey: string, value: string | string[]) => void;
}) {
  const raw = values[f.fieldKey];
  const strValue = typeof raw === "string" ? raw : "";
  return (
    <label className="text-sm font-medium text-crm-text">
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

/**
 * Backwards-compatible wrapper: renders unassigned fields inline followed by the
 * revealed tabs' fields as stacked sections. The clean form now uses the tab-bar
 * primitives above instead, but this is kept so any other caller keeps working.
 */
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
  const visibleTabs = useVisibleDispositionTabs(fields, tabs, decision);
  return (
    <>
      {unassignedFields(fields, decision).map((f) => (
        <DispositionField key={f.id} field={f} decision={decision} values={values} onChange={onChange} />
      ))}
      {visibleTabs.map((tab) => (
        <div key={tab.id} className="sm:col-span-2">
          <p className="mb-2 mt-1 text-xs font-semibold uppercase tracking-wide text-crm-muted">{tab.name}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {fieldsForTab(fields, tab.id, decision).map((f) => (
              <DispositionField key={f.id} field={f} decision={decision} values={values} onChange={onChange} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
