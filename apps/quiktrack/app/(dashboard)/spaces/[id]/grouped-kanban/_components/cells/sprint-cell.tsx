"use client";

import { useRef, useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import type { SprintLite } from "../../_types";
import { PopoverPanel } from "./popover-panel";

interface SprintCellProps {
  value: string | null;
  sprints: SprintLite[];
  onCommit: (sprintId: string | null) => void;
}

export function SprintCell({ value, sprints, onCommit }: SprintCellProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const current = sprints.find((s) => s.id === value);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 hover:bg-gray-100 px-1 py-0.5 text-xs text-gray-700 focus:outline-none focus-visible:outline-none dark:hover:bg-slate-700/50 dark:text-slate-200"
      >
        <CalendarRange className="h-3 w-3 text-gray-400" />
        <span className="truncate max-w-[140px]">{current?.name ?? "Backlog"}</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>
      <PopoverPanel
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        align="right"
        width={200}
      >
        {sprints.map((s) => {
          const status = (s.status ?? "").toUpperCase();
          const statusTone =
            status === "ACTIVE"
              ? "text-emerald-600 dark:text-emerald-400"
              : status === "FUTURE"
                ? "text-blue-600 dark:text-blue-300"
                : status === "CLOSED"
                  ? "text-gray-400 dark:text-slate-500"
                  : "text-gray-400 dark:text-slate-400";
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setOpen(false);
                if (s.id !== value) onCommit(s.id);
              }}
              className={`w-full text-left px-2 py-1 text-xs hover:bg-gray-50 ${
                s.id === value ? "bg-gray-50" : ""
              }`}
            >
              <span className="truncate">{s.name}</span>
              <span className={`ml-1 text-[10px] font-semibold uppercase tracking-wider ${statusTone}`}>
                {s.status}
              </span>
            </button>
          );
        })}
      </PopoverPanel>
    </>
  );
}
