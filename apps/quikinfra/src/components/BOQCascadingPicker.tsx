"use client";

/**
 * BOQ Cascading Picker
 *
 * A drill-down selector for a single BOQ leaf item. Given a flat list
 * of BOQ rows (each with `boq_no`, `parent_boq_no`, `depth`, `is_group`,
 * `display_name`, `tender_qty`, `unit`), it renders one searchable
 * combobox per depth level. Native `<select>` was too ugly on long BOQs
 * (25+ groups) and didn't support search, so every level is now a
 * branded `SearchSelect`.
 *
 *     Project-level group  ▼   "1 - BIJNOR ROAD PROJECTS"
 *     Sub-group             ▼   "1.1 - EXCAVATION"
 *     Leaf item             ▼   "1.1.2a - M-15 Grade Concrete (Qty: 1000 CUM)"
 *                  ↑
 *    onSelect fires with the leaf row, which includes tender_qty + unit
 *    so the parent form can auto-fill "BOQ Quantity".
 *
 * Behaviour:
 *   - Only groups are offered at non-leaf levels
 *   - When the user changes a higher level, all deeper levels reset
 *   - When the current bottom-most combobox picks a LEAF, onSelect fires
 *   - When it picks a GROUP, a new combobox appears below for its children
 *   - Controlled via `value` (the currently-selected leaf id or null) +
 *     `onSelect(row)` — the parent owns the final selection state
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";

export interface BoqRow {
  id: string;
  boq_no: string;
  parent_boq_no: string | null;
  depth: number;
  is_group: boolean;
  display_name: string;
  unit?: string | null;
  tender_qty?: number | null;
  category?: string;
}

interface Props {
  /** All BOQ rows for the current project (flat list). */
  items: BoqRow[];
  /** The currently-selected LEAF id, or null. */
  value: string | null;
  /** Called when the user picks a leaf. Called with null when cleared. */
  onSelect: (row: BoqRow | null) => void;
  /** Optional placeholder for the top-level combobox. */
  topPlaceholder?: string;
  /** Disable the whole picker. */
  disabled?: boolean;
}

export function BOQCascadingPicker({
  items,
  value,
  onSelect,
  topPlaceholder = "Select BOQ group",
  disabled,
}: Props) {
  // Index: parent_boq_no (or "__root__") → children[]
  const byParent = useMemo(() => {
    const map = new Map<string, BoqRow[]>();
    for (const row of items) {
      const key = row.parent_boq_no ?? "__root__";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    map.forEach((list) => {
      list.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    });
    return map;
  }, [items]);

  // Lookup: boq_no → row
  const byBoqNo = useMemo(() => {
    const map = new Map<string, BoqRow>();
    for (const row of items) map.set(row.boq_no, row);
    return map;
  }, [items]);

  // Chain of selected boq_no values, from root to (optionally) a leaf.
  const [chain, setChain] = useState<string[]>([]);

  // Restore chain when a `value` comes in externally (e.g. edit mode).
  useEffect(() => {
    if (!value) {
      setChain([]);
      return;
    }
    const leaf = items.find((r) => r.id === value);
    if (!leaf) return;
    const path: string[] = [leaf.boq_no];
    let cursor = leaf.parent_boq_no;
    while (cursor) {
      path.unshift(cursor);
      const parentRow = byBoqNo.get(cursor);
      if (!parentRow) break;
      cursor = parentRow.parent_boq_no;
    }
    setChain(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items]);

  function getLevelOptions(level: number): BoqRow[] {
    if (level === 0) {
      return byParent.get("__root__") ?? [];
    }
    const parentBoqNo = chain[level - 1];
    if (!parentBoqNo) return [];
    return byParent.get(parentBoqNo) ?? [];
  }

  function handleSelect(level: number, boqNo: string) {
    if (!boqNo) {
      const next = chain.slice(0, level);
      setChain(next);
      onSelect(null);
      return;
    }
    const row = byBoqNo.get(boqNo);
    if (!row) return;
    const next = [...chain.slice(0, level), boqNo];
    setChain(next);
    if (!row.is_group) {
      onSelect(row);
    } else {
      onSelect(null);
    }
  }

  // Render one combobox per level in the chain + one more if the current
  // deepest selection is a group (i.e. the user still needs to drill down).
  const levelsToRender: number[] = [];
  for (let i = 0; i <= chain.length; i++) {
    const opts = getLevelOptions(i);
    if (opts.length === 0) break;
    levelsToRender.push(i);
  }

  return (
    <div className="space-y-2">
      {levelsToRender.map((level) => {
        const options = getLevelOptions(level);
        const selectedBoqNo = chain[level] ?? "";
        const selectedRow = selectedBoqNo ? byBoqNo.get(selectedBoqNo) : null;
        const isLeafLevel = selectedRow && !selectedRow.is_group;

        // Map BoqRow → SearchSelectOption so the picker gets a unified
        // label + sublabel + searchable "code + description" text.
        const ssOptions: SearchSelectOption[] = options.map((row) => ({
          value: row.boq_no,
          label: `${row.boq_no} · ${row.display_name}`,
          sublabel: row.is_group
            ? undefined
            : row.tender_qty != null
            ? `Tender qty: ${row.tender_qty}${row.unit ? " " + row.unit.toUpperCase() : ""}`
            : undefined,
          searchText: `${row.boq_no} ${row.display_name}`,
          badge: row.is_group ? "GROUP" : row.unit?.toUpperCase(),
        }));

        const placeholder =
          level === 0
            ? topPlaceholder
            : selectedRow
            ? "Select…"
            : `Select sub-item of ${chain[level - 1]}`;

        return (
          <div
            key={level}
            className="flex items-start gap-2"
            style={{ paddingLeft: level * 20 }}
          >
            {level > 0 && (
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-2.5" />
            )}
            <div
              className={`flex-1 min-w-0 rounded-lg ${
                isLeafLevel ? "ring-2 ring-indigo-200" : ""
              }`}
            >
              <SearchSelect
                value={selectedBoqNo}
                onChange={(val) => handleSelect(level, val)}
                options={ssOptions}
                placeholder={placeholder}
                emptyText="No BOQ items match"
                disabled={disabled}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
