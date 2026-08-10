"use client";

import { Filter, X } from "lucide-react";
import type { FilterPayload } from "@/types/lead-filter";
import { OPERATOR_LABEL } from "@/types/lead-filter";
import { resolveLeadFilterField } from "@/lib/lead-filter-fields";
import type { FilterFieldDef } from "@/types/lead-filter";

export function AppliedFilterSummary({
  filter,
  onClear,
  extraFields = [],
  dynamicOptions = {},
}: {
  filter: FilterPayload;
  onClear: () => void;
  extraFields?: FilterFieldDef[];
  /**
   * Runtime option lists keyed by field (same map the modal uses). Lets the
   * chip show human labels instead of raw stored values — e.g. the Owner
   * filter stores ownerIds but should display "Name (email)".
   */
  dynamicOptions?: Record<string, { value: string; label: string }[]>;
}) {
  if (!filter.conditions.length) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-crm-blue/40 bg-crm-blue-soft px-3 py-2 text-xs text-crm-blue-dark ring-1 ring-crm-blue/10">
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <Filter size={13} className="shrink-0" />
        Filtered view
      </span>
      <span className="text-crm-blue-dark/70">·</span>
      <span className="font-medium">
        {filter.conditions.length} {filter.conditions.length === 1 ? "condition" : "conditions"} ({filter.matchMode})
      </span>
      <span className="text-crm-blue-dark/70">·</span>
      {filter.conditions.map((c, i) => {
        const def = resolveLeadFilterField(c.field, extraFields);
        // Translate stored values to labels when the field has an option map
        // (e.g. ownerId -> "Name (email)"). Falls back to the raw value.
        const opts = dynamicOptions[c.field];
        const labelFor = (val: unknown) => {
          const s = val == null ? "" : String(val);
          return opts?.find((o) => o.value === s)?.label ?? s;
        };
        const v = Array.isArray(c.value)
          ? c.value.map(labelFor).join(", ")
          : labelFor(c.value);
        return (
          <span key={i} className="rounded-full border border-crm-blue/30 bg-white/60 px-2 py-0.5">
            <span className="font-medium">{def?.label ?? c.field}</span>{" "}
            <span className="text-crm-muted">{OPERATOR_LABEL[c.operator]}</span>{" "}
            {String(v)}
          </span>
        );
      })}
      <button
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 rounded-md border border-crm-blue/50 bg-white px-2.5 py-1 font-semibold text-crm-blue shadow-sm transition hover:bg-crm-blue hover:text-white"
      >
        <X size={13} /> Clear filters
      </button>
    </div>
  );
}
