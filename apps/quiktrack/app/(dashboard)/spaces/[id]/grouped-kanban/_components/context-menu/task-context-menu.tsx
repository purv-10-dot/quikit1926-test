"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  getTaskActions,
  type MenuAction,
  type MenuActionContext,
} from "./menu-actions";

interface TaskContextMenuProps {
  ctx: MenuActionContext;
  x: number;
  y: number;
  onClose: () => void;
}

export function TaskContextMenu({ ctx, x, y, onClose }: TaskContextMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const actions = getTaskActions().filter((a) => !a.when || a.when(ctx));

  return (
    <div
      ref={rootRef}
      role="menu"
      style={{ top: y, left: x }}
      className="fixed z-50 min-w-[200px] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
    >
      {actions.map((a) => (
        <MenuItem key={a.id} action={a} ctx={ctx} onClose={onClose} />
      ))}
    </div>
  );
}

function MenuItem({
  action,
  ctx,
  onClose,
}: {
  action: MenuAction;
  ctx: MenuActionContext;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const submenu = action.submenu?.(ctx).filter((a) => !a.when || a.when(ctx)) ?? null;

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          if (submenu) return;
          action.run?.(ctx);
          onClose();
        }}
        className={`w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-gray-50 ${
          action.danger ? "text-red-600" : "text-gray-700"
        }`}
      >
        <span>{action.label}</span>
        <span className="flex items-center gap-2 ml-3 text-[10px] text-gray-400">
          {action.shortcut && <span>{action.shortcut}</span>}
          {submenu && <ChevronRight className="h-3 w-3" />}
        </span>
      </button>
      {submenu && open && submenu.length > 0 && (
        <div className="absolute left-full top-0 -ml-px min-w-[180px] rounded-md border border-gray-200 bg-white py-1 shadow-lg z-50">
          {submenu.map((sa) => (
            <button
              key={sa.id}
              type="button"
              role="menuitem"
              onClick={() => {
                sa.run?.(ctx);
                onClose();
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                sa.danger ? "text-red-600" : "text-gray-700"
              }`}
            >
              {sa.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
