"use client";

import { useState } from "react";
import { GripVertical } from "lucide-react";

/**
 * The ordered, drag-reorderable list of fields on a screen tab (HTML5 DnD, no
 * new deps). Each row has a drag handle and a Remove button on hover.
 */
export function ScreenFieldList({
  fieldKeys,
  onChange,
  labelOf,
}: {
  fieldKeys: string[];
  onChange: (next: string[]) => void;
  labelOf: (key: string) => string;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= fieldKeys.length) return;
    const next = fieldKeys.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  if (fieldKeys.length === 0) {
    return <div className="mt-4 rounded-md border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">No fields yet — add one below.</div>;
  }

  return (
    <div className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200">
      {fieldKeys.map((key, i) => (
        <div
          key={key}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => { if (dragIndex != null) move(dragIndex, i); setDragIndex(null); }}
          onDragEnd={() => setDragIndex(null)}
          className={`group flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 ${dragIndex === i ? "opacity-50" : ""}`}
        >
          <GripVertical className="h-4 w-4 cursor-grab text-gray-300 group-hover:text-gray-400" />
          <span className="flex-1 text-gray-800">{labelOf(key)}</span>
          <button
            type="button"
            onClick={() => onChange(fieldKeys.filter((_, j) => j !== i))}
            className="rounded px-2 py-1 text-xs font-medium text-gray-500 opacity-0 hover:bg-gray-200 group-hover:opacity-100"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
