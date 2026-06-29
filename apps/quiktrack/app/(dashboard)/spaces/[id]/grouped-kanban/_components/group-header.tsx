"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Lock,
  GripVertical,
} from "lucide-react";
import type { GroupedBoardGroup } from "../_types";
import { PopoverPanel } from "./cells/popover-panel";

const PRESET_COLORS = [
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#14b8a6",
  "#94a3b8",
];

interface GroupHeaderProps {
  group: GroupedBoardGroup;
  taskCount: number;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onDelete?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  /**
   * Derived (field-grouped) header: the name is a field value, not a user group,
   * so renaming, recoloring and deleting are all disabled. Collapse still works.
   */
  virtual?: boolean;
  /**
   * Read-only role (e.g. Viewer): like `virtual`, renaming/recoloring/deleting
   * are disabled and the options menu is hidden. Collapse still works so the
   * user can still navigate the board.
   */
  readOnly?: boolean;
}

export function GroupHeader({
  group,
  taskCount,
  onToggleCollapse,
  onRename,
  onRecolor,
  onDelete,
  draggable,
  onDragStart,
  virtual = false,
  readOnly = false,
}: GroupHeaderProps) {
  // A read-only role can't edit the group name/color or delete it. Reuse the
  // same disabled rendering as the derived (virtual) header.
  const locked = virtual || readOnly;
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setNameDraft(group.name), [group.name]);

  function commitName() {
    const trimmed = nameDraft.trim();
    setEditingName(false);
    if (trimmed && trimmed !== group.name) onRename(trimmed);
    else setNameDraft(group.name);
  }

  const validColor = /^#[0-9a-fA-F]{6}$/.test(group.color) ? group.color : "#94a3b8";

  return (
    <div
      onClick={onToggleCollapse}
      role="button"
      tabIndex={0}
      aria-expanded={!group.isCollapsed}
      aria-label={group.isCollapsed ? "Expand group" : "Collapse group"}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleCollapse();
        }
      }}
      className="flex items-center gap-2 px-1 py-1 select-none cursor-pointer"
    >
      {group.isCollapsed ? (
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: validColor }} aria-hidden />
      ) : (
        <ChevronDown className="h-4 w-4 shrink-0" style={{ color: validColor }} aria-hidden />
      )}
      {draggable && (
        <span
          draggable
          onDragStart={onDragStart}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-0.5 text-gray-500 hover:text-gray-700 cursor-grab active:cursor-grabbing"
          aria-label="Drag group"
          role="button"
          tabIndex={-1}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
      {locked ? (
        <span
          style={{ color: validColor }}
          className="text-lg font-bold tracking-tight"
        >
          {group.name}
        </span>
      ) : editingName ? (
        <input
          autoFocus
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onBlur={commitName}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commitName();
            } else if (e.key === "Escape") {
              setNameDraft(group.name);
              setEditingName(false);
            }
          }}
          maxLength={64}
          style={{ color: validColor, borderColor: validColor }}
          className="h-8 px-1 text-lg font-bold bg-white border-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditingName(true);
          }}
          style={{ color: validColor }}
          className="text-lg font-bold tracking-tight hover:underline"
        >
          {group.name}
        </button>
      )}
      <span
        style={{ color: validColor, borderColor: `${validColor}55` }}
        className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full border bg-white"
      >
        {taskCount}
      </span>
      {group.isDefault && (
        <span
          className="inline-flex items-center gap-1 text-[10px] text-gray-500"
          title="Default group — cannot be deleted"
        >
          <Lock className="h-3 w-3" />
          Default
        </span>
      )}

      {!locked && (
      <div
        className="ml-auto relative"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          ref={menuBtnRef}
          type="button"
          onClick={() => {
            setColorOpen(false);
            setMenuOpen((v) => !v);
          }}
          className="p-1 rounded hover:bg-black/5 text-gray-500"
          aria-label="Group options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        <PopoverPanel
          anchorRef={menuBtnRef}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          align="right"
          placement="down"
          width={180}
          estimatedHeight={120}
        >
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setColorOpen(true);
            }}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700"
          >
            Change color
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onToggleCollapse();
            }}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700"
          >
            {group.isCollapsed ? "Expand" : "Collapse"}
          </button>
          <button
            type="button"
            disabled={group.isDefault}
            onClick={() => {
              if (group.isDefault) return;
              setMenuOpen(false);
              onDelete?.();
            }}
            className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs whitespace-nowrap ${
              group.isDefault
                ? "text-gray-300 cursor-not-allowed"
                : "text-red-600 hover:bg-red-50"
            }`}
            title={
              group.isDefault
                ? "The default Ungrouped group cannot be deleted"
                : "Delete group"
            }
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            <span>Delete group</span>
          </button>
        </PopoverPanel>

        <PopoverPanel
          anchorRef={menuBtnRef}
          open={colorOpen}
          onClose={() => setColorOpen(false)}
          align="right"
          placement="down"
          width={208}
          estimatedHeight={56}
        >
          <div className="flex gap-2 p-2">
            {PRESET_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => {
                  onRecolor(c);
                  setColorOpen(false);
                }}
                className="h-6 w-6 rounded-full border border-white ring-1 ring-gray-200 hover:ring-2 hover:ring-gray-900"
                style={{ background: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </PopoverPanel>
      </div>
      )}
    </div>
  );
}
