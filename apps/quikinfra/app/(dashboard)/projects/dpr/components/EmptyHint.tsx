"use client";

import { Plus } from "lucide-react";

export function EmptyHint({
  text,
  icon,
  onAdd,
  addLabel = "Add the first row",
}: {
  text: string;
  icon?: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
}) {
  // Slim, single-line empty state. The whole row is the CTA: clicking
  // anywhere inside calls onAdd, so the empty state stops being passive
  // decoration and becomes the primary action when a section is empty.
  // Used by Materials / Manpower / Staff / Machinery — secondary sections
  // that should stay visually quieter than the larger Work-Done empty state.
  const Tag: React.ElementType = onAdd ? "button" : "div";
  return (
    <Tag
      type={onAdd ? "button" : undefined}
      onClick={onAdd}
      className={`group w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/40 text-left transition-colors ${
        onAdd ? "hover:bg-accent-50 hover:border-accent-300 cursor-pointer" : ""
      }`}
    >
      {icon && (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white text-slate-400 ring-1 ring-slate-200 group-hover:text-accent-600 group-hover:ring-accent-200 transition-colors shrink-0">
          {icon}
        </span>
      )}
      <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-800 transition-colors">
        {text}
      </span>
      {onAdd && (
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-accent-700 opacity-70 group-hover:opacity-100 transition-opacity">
          <Plus className="w-3 h-3" /> {addLabel}
        </span>
      )}
    </Tag>
  );
}