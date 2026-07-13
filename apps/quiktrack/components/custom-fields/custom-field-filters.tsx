"use client";

import type { CustomFieldDTO } from "@/lib/services/customFields";
import type { CustomFilter } from "@/lib/customFields/filterQuery";
import type { FieldType } from "@/lib/customFields/registry";
import type { MemberOption } from "./field-control";
import { FilterSelect } from "@/app/(dashboard)/spaces/[id]/grouped-kanban/_components/toolbar/filter-select";
import { FilterMultiSelect } from "@/app/(dashboard)/spaces/[id]/grouped-kanban/_components/toolbar/filter-multi-select";

/**
 * Filter controls for custom fields, for the Backlog/Board filter panel.
 * Produces a `CustomFilter[]` the caller serializes into the `customFilters`
 * query param on /api/issues. An empty value drops the filter.
 *
 * Only the field types that make a sensible, precise filter are offered
 * ({@link FILTERABLE_CUSTOM_FIELD_TYPES}) — free-text (Short/Long text, URL),
 * Number, and free-form Labels are intentionally excluded. Option- and
 * people-pickers use searchable dropdowns so long lists stay usable.
 */

/** Custom-field types exposed in the filter panel. */
export const FILTERABLE_CUSTOM_FIELD_TYPES: FieldType[] = [
  "DROPDOWN_SINGLE",
  "DROPDOWN_MULTI",
  "CHECKBOX",
  "USER_PICKER",
  "USER_PICKER_MULTI",
  "DATE",
];

const FILTERABLE = new Set<string>(FILTERABLE_CUSTOM_FIELD_TYPES);

/** True when a field's type can be added to the filter panel. */
export function isFilterableField(field: { type: string }): boolean {
  return FILTERABLE.has(field.type);
}

interface Props {
  fields: CustomFieldDTO[];
  value: CustomFilter[];
  onChange: (next: CustomFilter[]) => void;
  members?: MemberOption[];
  /** Wrapper class. Pass "contents" to let each field flow into a parent grid. */
  className?: string;
}

const SELECT =
  "w-full h-8 px-2 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400";

export function CustomFieldFilters({
  fields,
  value,
  onChange,
  members = [],
  className = "space-y-2",
}: Props) {
  const filterable = fields.filter(isFilterableField);
  if (filterable.length === 0) return null;

  const byId = new Map(value.map((f) => [f.fieldId, f]));
  const memberOptions = members.map((m) => ({ value: m.id, label: m.label }));

  function set(field: CustomFieldDTO, op: CustomFilter["op"], v: unknown) {
    const next = value.filter((f) => f.fieldId !== field.id);
    const blank =
      v === "" || v === null || v === undefined || (Array.isArray(v) && v.length === 0);
    if (!blank) next.push({ fieldId: field.id, type: field.type, op, value: v });
    onChange(next);
  }

  return (
    <div className={className}>
      {filterable.map((field) => {
        const current = byId.get(field.id);
        return (
          <div key={field.id} className="text-xs">
            <span className="mb-1 block font-medium text-gray-600">{field.name}</span>
            {renderControl(field, current)}
          </div>
        );
      })}
    </div>
  );

  function renderControl(field: CustomFieldDTO, current: CustomFilter | undefined) {
    const active = field.options.filter((o) => o.isActive);
    const v = current?.value;

    switch (field.type) {
      case "DROPDOWN_SINGLE":
        return (
          <FilterSelect
            expand
            searchable
            placeholder="Any"
            value={typeof v === "string" ? v : Array.isArray(v) ? (v[0] as string) ?? "" : ""}
            onChange={(val) => set(field, "in", val ? [val] : "")}
            options={[
              { value: "", label: "Any", muted: true },
              ...active.map((o) => ({ value: o.value, label: o.label })),
            ]}
          />
        );
      case "DROPDOWN_MULTI":
        return (
          <FilterMultiSelect
            expand
            searchable
            placeholder="Any"
            summaryNoun="options"
            values={Array.isArray(v) ? (v as string[]) : []}
            onChange={(vals) => set(field, "has_any", vals)}
            options={active.map((o) => ({ value: o.value, label: o.label }))}
          />
        );
      case "USER_PICKER":
        return (
          <FilterSelect
            expand
            searchable
            placeholder="Any"
            value={typeof v === "string" ? v : ""}
            onChange={(val) => set(field, "is", val)}
            options={[{ value: "", label: "Any", muted: true }, ...memberOptions]}
          />
        );
      case "USER_PICKER_MULTI":
        return (
          <FilterMultiSelect
            expand
            searchable
            placeholder="Any"
            summaryNoun="people"
            values={Array.isArray(v) ? (v as string[]) : []}
            onChange={(vals) => set(field, "has_any", vals)}
            options={memberOptions}
          />
        );
      case "CHECKBOX":
        return (
          <select
            className={SELECT}
            value={current ? (current.op === "is_true" ? "true" : "false") : ""}
            onChange={(e) =>
              e.target.value === ""
                ? set(field, "is_true", "")
                : set(field, e.target.value === "true" ? "is_true" : "is_false", true)
            }
          >
            <option value="">Any</option>
            <option value="true">Checked</option>
            <option value="false">Unchecked</option>
          </select>
        );
      case "DATE":
        return (
          <input
            type="date"
            className={SELECT}
            value={(v as string) ?? ""}
            onChange={(e) => set(field, "eq", e.target.value)}
          />
        );
      default:
        return null; // non-filterable types are excluded above
    }
  }
}
