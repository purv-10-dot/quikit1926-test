"use client";

import { ArrowDown, ArrowUp, EyeOff, MoreVertical, Pin, PinOff } from "lucide-react";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";

interface Props {
  columnKey: string;
  label: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  isFrozen: boolean;
  /** When false, sort items are shown but disabled (e.g. dynamic fields). */
  sortable: boolean;
  onSort: (key: string, dir: "asc" | "desc") => void;
  onToggleFreeze: (key: string) => void;
  onHide: (key: string) => void;
}

export function ColumnHeaderMenu({
  columnKey,
  label,
  sortBy,
  sortDir,
  isFrozen,
  sortable,
  onSort,
  onToggleFreeze,
  onHide,
}: Props) {
  const isActiveAsc = sortBy === columnKey && sortDir === "asc";
  const isActiveDesc = sortBy === columnKey && sortDir === "desc";

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {(isActiveAsc || isActiveDesc) && (
        <span className="shrink-0 text-crm-blue" aria-hidden>
          {isActiveAsc ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
        </span>
      )}
      <Dropdown
        align="left"
        trigger={
          <button
            type="button"
            aria-label={`Column options for ${label}`}
            className="shrink-0 rounded p-0.5 text-crm-muted hover:bg-crm-panel hover:text-crm-text"
          >
            <MoreVertical size={14} />
          </button>
        }
      >
        <DropdownItem
          onSelect={() => sortable && onSort(columnKey, "asc")}
          disabled={!sortable}
        >
          <span className="flex items-center gap-2">
            <ArrowUp size={14} /> Sort Ascending
          </span>
        </DropdownItem>
        <DropdownItem
          onSelect={() => sortable && onSort(columnKey, "desc")}
          disabled={!sortable}
        >
          <span className="flex items-center gap-2">
            <ArrowDown size={14} /> Sort Descending
          </span>
        </DropdownItem>
        <DropdownItem onSelect={() => onToggleFreeze(columnKey)}>
          <span className="flex items-center gap-2">
            {isFrozen ? <PinOff size={14} /> : <Pin size={14} />}
            {isFrozen ? "Unfreeze Column" : "Freeze Column"}
          </span>
        </DropdownItem>
        <DropdownItem onSelect={() => onHide(columnKey)}>
          <span className="flex items-center gap-2">
            <EyeOff size={14} /> Hide
          </span>
        </DropdownItem>
      </Dropdown>
    </div>
  );
}
