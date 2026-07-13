"use client";

/**
 * PermissionMatrixEditor — reusable matrix UI for granting / revoking
 * per-page permissions. Used in Step 2 of the Add / Edit User drawer.
 *
 * Purely controlled: caller owns `matrix` state and receives every
 * change through `onChange(next)`. Bulk-action toolbar was removed in
 * favour of cell-level editing + the summary the parent renders.
 */

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Eye, ChevronDown, type LucideIcon } from "lucide-react";
import {
  MENU_CATALOG,
  MATRIX_ACTIONS,
  groupByModule,
  type PermissionMatrix,
  type MatrixAction,
  type MatrixRow,
  type MenuItem,
} from "@/lib/rbac/menu-catalog";

const ACTION_META: Record<MatrixAction, { icon: LucideIcon; label: string }> = {
  add: { icon: Plus, label: "Add" },
  edit: { icon: Pencil, label: "Edit" },
  delete: { icon: Trash2, label: "Delete" },
  view: { icon: Eye, label: "View" },
};

function rowGranted(row: MatrixRow | undefined): boolean {
  if (!row) return false;
  return !!(row.add || row.edit || row.delete || row.view);
}

export interface PermissionMatrixEditorProps {
  matrix: PermissionMatrix;
  onChange: (next: PermissionMatrix) => void;
  /** Compact mode caps the table height so it fits inside a drawer. */
  compact?: boolean;
}

export function PermissionMatrixEditor({
  matrix,
  onChange,
  compact = false,
}: PermissionMatrixEditorProps) {
  const grouped = useMemo(() => groupByModule(), []);

  const toggleCell = (menuKey: string, action: MatrixAction) => {
    const item = MENU_CATALOG.find((m) => m.key === menuKey);
    if (!item || !item.supports[action]) return;
    onChange({
      ...matrix,
      [menuKey]: {
        ...matrix[menuKey],
        [action]: !matrix[menuKey]?.[action],
      } as MatrixRow,
    });
  };

  /**
   * Toggle every row in a module group in a single onChange call.
   *
   * Looping per-row toggles would call onChange N times against the
   * stale `matrix` prop — React doesn't re-render between calls in a
   * synchronous block, so each call overwrites the last and only the
   * final row's toggle persists. Build the full next matrix here and
   * commit it once.
   */
  const toggleGroupRows = (groupItems: MenuItem[], value: boolean) => {
    const next: PermissionMatrix = { ...matrix };
    for (const item of groupItems) {
      next[item.key] = {
        add: item.supports.add && value,
        edit: item.supports.edit && value,
        delete: item.supports.delete && value,
        view: item.supports.view && value,
      };
    }
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Matrix table — flat, no zebra. Page URL is folded under each
          menu name as a thin secondary line so we recover the column
          width and stop the URL column from fighting for attention. */}
      <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col min-h-0">
        <div
          className={`overflow-auto ${compact ? "max-h-[440px]" : "flex-1"}`}
        >
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-gray-200 text-[10px] uppercase font-semibold text-gray-500 tracking-wider">
                <th className="px-4 py-2.5 text-left">Menu</th>
                {MATRIX_ACTIONS.map((a) => {
                  const Icon = ACTION_META[a].icon;
                  return (
                    <th
                      key={a}
                      className="px-2 py-2.5 text-center w-[68px]"
                    >
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <Icon className="w-3 h-3" />
                        {ACTION_META[a].label}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([module, items]) => {
                if (!items || items.length === 0) return null;
                return (
                  <ModuleGroup
                    key={module}
                    module={module}
                    items={items}
                    matrix={matrix}
                    onToggleCell={toggleCell}
                    onToggleGroup={toggleGroupRows}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ModuleGroup({
  module,
  items,
  matrix,
  onToggleCell,
  onToggleGroup,
}: {
  module: string;
  items: MenuItem[];
  matrix: PermissionMatrix;
  onToggleCell: (menuKey: string, action: MatrixAction) => void;
  onToggleGroup: (items: MenuItem[], value: boolean) => void;
}) {
  const rowsGranted = items.filter((item) =>
    rowGranted(matrix[item.key]),
  ).length;
  const rowsTotal = items.length;

  const allOn = items.every((item) =>
    MATRIX_ACTIONS.every(
      (a) => !item.supports[a] || matrix[item.key]?.[a],
    ),
  );
  const none = rowsGranted === 0;
  const partial = !allOn && !none;

  // Accordion state — default to expanded if the group has one or more grants
  // so admins immediately see what they've already configured. Modules
  // with zero grants start collapsed to reduce visual noise. The user
  // can toggle either direction freely after that.
  const [open, setOpen] = useState<boolean>(rowsGranted > 0);

  const toggleGroup = () => {
    onToggleGroup(items, !allOn);
  };

  return (
    <>
      <tr className="bg-gray-50 border-t border-gray-200">
        <td className="px-4 py-2" colSpan={5}>
          {/* Header row: click anywhere outside the checkbox toggles
              expand/collapse. The checkbox itself keeps its existing
              "tick all rows in this module" behaviour. */}
          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={() => setOpen((v) => !v)}
            role="button"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${module}`}
          >
            <ChevronDown
              className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-150 ${
                open ? "" : "-rotate-90"
              }`}
            />
            <input
              type="checkbox"
              checked={allOn}
              ref={(el) => {
                if (el) el.indeterminate = partial;
              }}
              onClick={(e) => e.stopPropagation()}
              onChange={toggleGroup}
              className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-2 focus:ring-orange-500 cursor-pointer"
            />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-700">
              {module}
            </span>
            <span
              className={`text-[10px] tabular-nums ${
                none ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {rowsGranted} / {rowsTotal}
            </span>
          </div>
        </td>
      </tr>
      {open &&
        items.map((item) => {
          const row = matrix[item.key] ?? {
            add: false,
            edit: false,
            delete: false,
            view: false,
          };
          return (
            <tr
              key={item.key}
              className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors"
            >
              <td className="px-4 py-2 pl-12">
                <span className="text-sm text-gray-800">{item.label}</span>
              </td>
              {MATRIX_ACTIONS.map((a) => {
                const supported = item.supports[a];
                const checked = !!row[a];
                return (
                  <td key={a} className="px-2 py-1.5 text-center w-[68px]">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!supported}
                      onChange={() => onToggleCell(item.key, a)}
                      className={`w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-2 focus:ring-orange-500 ${
                        !supported
                          ? "opacity-25 cursor-not-allowed"
                          : "cursor-pointer"
                      }`}
                    />
                  </td>
                );
              })}
            </tr>
          );
        })}
    </>
  );
}
