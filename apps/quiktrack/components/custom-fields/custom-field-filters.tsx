"use client";

import type { CustomFieldDTO } from "@/lib/services/customFields";
import type { CustomFilter } from "@/lib/customFields/filterQuery";
import type { MemberOption } from "./field-control";

/**
 * Filter controls for custom fields, for the Backlog/Board filter panel.
 * Produces a `CustomFilter[]` the caller serializes into the `customFilters`
 * query param on /api/issues. Each field maps to its primary operator (FRD §4);
 * an empty value drops the filter.
 */
interface Props {
  fields: CustomFieldDTO[];
  value: CustomFilter[];
  onChange: (next: CustomFilter[]) => void;
  members?: MemberOption[];
}

const SELECT =
  "w-full h-8 px-2 text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400";

export function CustomFieldFilters({ fields, value, onChange, members = [] }: Props) {
  if (fields.length === 0) return null;

  const byId = new Map(value.map((f) => [f.fieldId, f]));

  function set(field: CustomFieldDTO, op: CustomFilter["op"], v: unknown) {
    const next = value.filter((f) => f.fieldId !== field.id);
    const blank = v === "" || v === null || v === undefined || (Array.isArray(v) && v.length === 0);
    if (!blank) next.push({ fieldId: field.id, type: field.type, op, value: v });
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {fields.map((field) => {
        const current = byId.get(field.id);
        return (
          <div key={field.id} className="text-xs">
            <span className="mb-1 block font-medium text-gray-600">{field.name}</span>
            {renderControl(field, current, members, set)}
          </div>
        );
      })}
    </div>
  );

  function renderControl(
    field: CustomFieldDTO,
    current: CustomFilter | undefined,
    members: MemberOption[],
    set: (field: CustomFieldDTO, op: CustomFilter["op"], v: unknown) => void,
  ) {
    const active = field.options.filter((o) => o.isActive);
    const v = current?.value;

    switch (field.type) {
      case "DROPDOWN_SINGLE":
        return (
          <select className={SELECT} value={(v as string) ?? ""} onChange={(e) => set(field, "in", e.target.value ? [e.target.value] : "")}>
            <option value="">Any</option>
            {active.map((o) => (
              <option key={o.id} value={o.value}>{o.label}</option>
            ))}
          </select>
        );
      case "DROPDOWN_MULTI":
      case "LABELS":
        return (
          <div className="flex flex-wrap gap-1">
            {active.length === 0 && field.type === "LABELS" ? (
              <input
                className={SELECT}
                placeholder="label,label"
                defaultValue={Array.isArray(v) ? (v as string[]).join(",") : ""}
                onBlur={(e) => set(field, "has_any", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              />
            ) : (
              active.map((o) => {
                const arr = (Array.isArray(v) ? (v as string[]) : []);
                const on = arr.includes(o.value);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => set(field, "has_any", on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                    className={`px-2 h-6 rounded-full border ${on ? "bg-blue-50 border-blue-300 text-blue-700" : "border-gray-300 text-gray-600"}`}
                  >
                    {o.label}
                  </button>
                );
              })
            )}
          </div>
        );
      case "CHECKBOX":
        return (
          <select
            className={SELECT}
            value={current ? (current.op === "is_true" ? "true" : "false") : ""}
            onChange={(e) => (e.target.value === "" ? set(field, "is_true", "") : set(field, e.target.value === "true" ? "is_true" : "is_false", true))}
          >
            <option value="">Any</option>
            <option value="true">Checked</option>
            <option value="false">Unchecked</option>
          </select>
        );
      case "USER_PICKER":
        return (
          <select className={SELECT} value={(v as string) ?? ""} onChange={(e) => set(field, "is", e.target.value)}>
            <option value="">Any</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        );
      case "NUMBER":
        return (
          <input type="number" className={SELECT} defaultValue={(v as number) ?? ""} placeholder="equals" onBlur={(e) => set(field, "eq", e.target.value === "" ? "" : Number(e.target.value))} />
        );
      case "DATE":
        return <input type="date" className={SELECT} value={(v as string) ?? ""} onChange={(e) => set(field, "eq", e.target.value)} />;
      default: // SHORT_TEXT, LONG_TEXT, URL
        return <input className={SELECT} defaultValue={(v as string) ?? ""} placeholder="contains" onBlur={(e) => set(field, "contains", e.target.value)} />;
    }
  }
}
