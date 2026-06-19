"use client";

import { X, RotateCcw } from "lucide-react";
import { clsx } from "clsx";

export interface FilterChip {
  key: string;
  field: string;
  op: "equals" | "in" | "contains";
  values: string[];
}

interface Props {
  chips: FilterChip[];
  onRemove: (key: string) => void;
  onResetAll?: () => void;
}

export function FilterChipsBar({ chips, onRemove, onResetAll }: Props) {
  if (chips.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {onResetAll && (
        <button
          onClick={onResetAll}
          className="w-7 h-7 rounded-full bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 flex items-center justify-center text-gray-500 transition"
          title="Reset all filters"
        >
          <RotateCcw size={12} />
        </button>
      )}
      {chips.map((c) => (
        <Chip key={c.key} chip={c} onRemove={() => onRemove(c.key)} />
      ))}
    </div>
  );
}

function Chip({ chip, onRemove }: { chip: FilterChip; onRemove: () => void }) {
  const opLabel = chip.op === "equals" ? "equals" : chip.op === "contains" ? "contains" : "in";
  return (
    <span className={clsx(
      "inline-flex items-center gap-2 pl-3 pr-1.5 py-1 rounded-full text-xs",
      "bg-blue-50 border border-blue-100 text-gray-700",
    )}>
      <span className="font-semibold text-gray-900">{chip.field}</span>
      <span className="text-gray-500">{opLabel}</span>
      <span className="font-semibold text-gray-900 truncate max-w-[200px]">{chip.values.join(", ")}</span>
      <button
        onClick={onRemove}
        className="w-4 h-4 rounded-full bg-white/60 hover:bg-red-100 flex items-center justify-center text-gray-500 hover:text-red-600 transition"
        aria-label="Remove filter"
      >
        <X size={10} />
      </button>
    </span>
  );
}
