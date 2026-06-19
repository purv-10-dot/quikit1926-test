"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Type,
  AlignLeft,
  Hash,
  Calendar,
  List,
  ListChecks,
  CheckSquare,
  Link2,
  User,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { FIELD_TYPES, FIELD_REGISTRY, type FieldType } from "@/lib/customFields/registry";

/** A glyph per field type, so the picker reads at a glance (Jira-style). */
const ICONS: Record<FieldType, LucideIcon> = {
  SHORT_TEXT: Type,
  LONG_TEXT: AlignLeft,
  NUMBER: Hash,
  DATE: Calendar,
  DROPDOWN_SINGLE: List,
  DROPDOWN_MULTI: ListChecks,
  CHECKBOX: CheckSquare,
  URL: Link2,
  USER_PICKER: User,
  LABELS: Tag,
};

/**
 * Icon + label dropdown for the "Field type" selector in the create/edit field
 * drawer. Replaces the bare native <select> so each type carries its glyph.
 */
export function FieldTypePicker({
  value,
  onChange,
  disabled,
}: {
  value: FieldType;
  onChange: (type: FieldType) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const SelIcon = ICONS[value];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between w-full h-9 px-3 text-sm border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 ${
          open ? "border-blue-500 ring-2 ring-blue-500" : "border-gray-300"
        }`}
      >
        <span className="inline-flex items-center gap-2 truncate">
          <SelIcon className="h-4 w-4 text-gray-500 shrink-0" />
          <span className="text-gray-800 truncate">{FIELD_REGISTRY[value].label}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-500 shrink-0" />
      </button>
      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1 max-h-72 overflow-y-auto">
          {FIELD_TYPES.map((t) => {
            const Icon = ICONS[t];
            const active = t === value;
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
                className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left ${
                  active ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-blue-600" : "text-gray-500"}`} />
                {FIELD_REGISTRY[t].label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
