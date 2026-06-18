"use client";

import { GripVertical, Plus, X } from "lucide-react";

export interface OptionDraft {
  id?: string; // present = existing option (rename/deactivate); absent = new
  label: string;
  isActive: boolean;
}

/**
 * Editor for Dropdown (single/multi) options. Existing options keep their `id`
 * so the service can rename/deactivate them without losing stored values;
 * removing an existing option deactivates it (FRD §5.4 — never hard-delete).
 */
export function OptionsEditor({
  options,
  onChange,
}: {
  options: OptionDraft[];
  onChange: (next: OptionDraft[]) => void;
}) {
  function update(i: number, patch: Partial<OptionDraft>) {
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function remove(i: number) {
    const opt = options[i]!;
    // Existing → deactivate (preserve history); new → drop entirely.
    if (opt.id) update(i, { isActive: false });
    else onChange(options.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...options, { label: "", isActive: true }]);
  }

  const visible = options
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.isActive || !o.id || o.label); // hide silently-removed new rows

  return (
    <div className="space-y-1.5">
      {visible.map(({ o, i }) => (
        <div key={o.id ?? `new-${i}`} className={`flex items-center gap-2 ${o.isActive ? "" : "opacity-50"}`}>
          <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
          <input
            value={o.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder={`Option ${i + 1}`}
            className="flex-1 h-8 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {o.id && !o.isActive ? (
            <button
              type="button"
              onClick={() => update(i, { isActive: true })}
              className="text-[11px] text-blue-600 hover:underline px-1"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={() => remove(i)}
              className="p-1 text-gray-400 hover:text-gray-600"
              aria-label="Remove option"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 mt-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Add option
      </button>
    </div>
  );
}
