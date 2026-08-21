"use client";

import { DatePicker, FilterPicker, Input } from "@quikit/ui";
import { UNASSIGNED, isMultiFilter, type FilterDef, type FilterOption } from "@/lib/test/caseFilters";

/**
 * Renders the control for ONE filter definition, and turns its output back into
 * the single URL-param string `useCaseFilters` stores.
 *
 * Multi-value filters (enum / person / id) serialise as `a,b,c` via FilterPicker's
 * existing multi-select mode — reused rather than rebuilt, so labels/runs/statuses
 * get the same chip-with-remove UI as every other multi-picker in the app.
 */

const UNASSIGNED_OPTION: FilterOption = { value: UNASSIGNED, label: "Unassigned" };

function splitCsv(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export function FilterField({
  def,
  value,
  onChange,
  options,
}: {
  def: FilterDef;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  /** Dynamic options for `id`/`person` kinds; ignored for static `enum`/`flag`. */
  options?: FilterOption[];
}) {
  if (def.kind === "text") {
    return (
      <Input
        value={value ?? ""}
        placeholder={def.placeholder}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    );
  }

  if (def.kind === "ref") {
    return (
      <Input
        value={value ?? ""}
        placeholder={def.placeholder}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    );
  }

  if (def.kind === "date") {
    return (
      <DatePicker
        value={value ?? ""}
        onChange={(next) => onChange(next || undefined)}
        placeholder="Any date"
      />
    );
  }

  if (def.kind === "flag") {
    const opts = def.options ?? [];
    return (
      <FilterPicker
        value={value ?? ""}
        onChange={(v) => onChange(v || undefined)}
        options={opts}
        allLabel="Either"
      />
    );
  }

  // enum / id / person all render as the same multi-select picker; they differ
  // only in where their option list comes from.
  const opts = def.kind === "enum" ? (def.options ?? []) : (options ?? []);
  const withUnassigned =
    def.kind === "person" || def.key === "candidate" ? [UNASSIGNED_OPTION, ...opts] : opts;

  const selected = splitCsv(value);

  return (
    <FilterPicker
      multiple={isMultiFilter(def)}
      values={selected}
      onChangeMultiple={(vals) => onChange(vals.length > 0 ? vals.join(",") : undefined)}
      options={withUnassigned}
      allLabel="All"
      placeholder={`Search ${def.label.toLowerCase()}…`}
    />
  );
}
