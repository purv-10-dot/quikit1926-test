"use client";

import { X } from "lucide-react";
import type { FilterPayload } from "@/types/lead-filter";
import { OPERATOR_LABEL } from "@/types/lead-filter";
import { resolveLeadFilterField } from "@/lib/lead-filter-fields";
import type { FilterFieldDef } from "@/types/lead-filter";

export function AppliedFilterSummary({
  filter,
  onClear,
  extraFields = [],
}: {
  filter: FilterPayload;
  onClear: () => void;
  extraFields?: FilterFieldDef[];
}) {
  if (!filter.conditions.length) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-crm-blue-soft px-3 py-2 text-xs text-crm-blue-dark">
      <span className="font-medium">
        {filter.conditions.length} {filter.conditions.length === 1 ? "condition" : "conditions"} ({filter.matchMode})
      </span>
      <span className="text-crm-blue-dark/70">·</span>
      {filter.conditions.map((c, i) => {
        const def = resolveLeadFilterField(c.field, extraFields);
        const v = Array.isArray(c.value) ? c.value.join(", ") : c.value ?? "";
        return (
          <span key={i} className="rounded-full border border-crm-blue/30 bg-white/60 px-2 py-0.5">
            <span className="font-medium">{def?.label ?? c.field}</span>{" "}
            <span className="text-crm-muted">{OPERATOR_LABEL[c.operator]}</span>{" "}
            {String(v)}
          </span>
        );
      })}
      <button onClick={onClear} className="ml-auto inline-flex items-center gap-1 hover:text-crm-blue">
        <X size={12} /> Clear
      </button>
    </div>
  );
}
