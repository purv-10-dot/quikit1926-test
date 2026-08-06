"use client";

import { useEffect, useState } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import { cn } from "../lib/utils";

export interface ManageColumn {
  key: string;
  label: string;
}

interface ManageColsModalProps {
  open: boolean;
  onClose: () => void;
  columns: ManageColumn[];
  hiddenCols: string[];
  onChange: (nextHidden: string[]) => void;
}

/**
 * Manage Columns — canonical UI for showing/hiding table columns.
 * Replaces the legacy "Hidden cols" pill.
 *
 * Visual spec:
 *   visible → accent color (theme-driven)
 *   hidden  → grey (NOT red — red reads as error)
 */
export function ManageColsModal({
  open,
  onClose,
  columns,
  hiddenCols,
  onChange,
}: ManageColsModalProps) {
  const [local, setLocal] = useState<string[]>(hiddenCols);
  useEffect(() => setLocal(hiddenCols), [hiddenCols, open]);

  if (!open) return null;

  const isHidden = (k: string) => local.includes(k);
  const toggle = (k: string) => {
    setLocal((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  };
  const showAll = () => setLocal([]);
  const hideAll = () => setLocal(columns.map((c) => c.key));

  const apply = () => {
    onChange(local);
    onClose();
  };

  const visibleCount = columns.length - local.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Manage Columns</h3>
            <p className="text-xs text-gray-500">
              {visibleCount} of {columns.length} columns visible
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Bulk controls */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100">
          <button
            type="button"
            onClick={showAll}
            className="text-xs text-accent-700 hover:text-accent-800 font-medium"
          >
            Show all
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={hideAll}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            Hide all
          </button>
        </div>

        {/* Column list */}
        <div className="flex-1 overflow-y-auto py-1">
          {columns.map((c) => {
            const hidden = isHidden(c.key);
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggle(c.key)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-5 py-2 hover:bg-gray-50 transition-colors",
                  hidden ? "text-gray-400" : "text-accent-700",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {hidden ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 text-accent-600" />
                  )}
                  {c.label}
                </span>
                {/* Pill badge */}
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full",
                    hidden
                      ? "bg-gray-100 text-gray-500"
                      : "bg-accent-100 text-accent-700",
                  )}
                >
                  {hidden ? "Hidden" : "Visible"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
