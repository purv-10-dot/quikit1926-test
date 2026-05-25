"use client";

import { useRef, useState } from "react";
import type { GroupedBoardStatus } from "../../_types";
import { PopoverPanel } from "./popover-panel";

interface StatusCellProps {
  value: string;
  statuses: GroupedBoardStatus[];
  onCommit: (statusId: string) => void;
}

function blockStyles(hex: string | null | undefined): React.CSSProperties {
  const c = hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#94a3b8";
  return { backgroundColor: `${c}1a`, color: c };
}

export function StatusCell({ value, statuses, onCommit }: StatusCellProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const current = statuses.find((s) => s.id === value);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={blockStyles(current?.color)}
        className="w-full flex items-center justify-center px-2 py-1.5 text-[11px] font-semibold hover:brightness-95 transition"
      >
        <span className="truncate">{current?.name ?? "—"}</span>
      </button>
      <PopoverPanel anchorRef={btnRef} open={open} onClose={() => setOpen(false)} width={160}>
        {statuses.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setOpen(false);
              if (s.id !== value) onCommit(s.id);
            }}
            style={blockStyles(s.color)}
            className={`w-full flex items-center justify-center px-2 py-1.5 text-[11px] font-semibold transition hover:brightness-95 ${
              s.id === value ? "ring-2 ring-inset ring-blue-400" : ""
            }`}
          >
            {s.name}
          </button>
        ))}
      </PopoverPanel>
    </>
  );
}
