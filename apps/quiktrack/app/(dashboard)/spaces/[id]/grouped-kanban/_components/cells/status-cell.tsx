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
  // The `--qt-status-c` CSS var carries the status color to dark-mode
  // overrides in globals.css, where the bg opacity is bumped from 10% to
  // ~30% and the text is mixed with white so the pill stays legible on the
  // dark surface. Light-mode defaults remain via the inline bg/color below.
  return {
    "--qt-status-c": c,
    backgroundColor: `${c}1a`,
    color: c,
  } as React.CSSProperties;
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
        data-status-pill
        className="qt-status-pill w-full flex items-center justify-center px-2 py-1.5 text-xs font-semibold hover:brightness-95 transition"
      >
        <span>{current?.name ?? "—"}</span>
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
            data-status-pill
            className={`qt-status-pill w-full flex items-center justify-center px-2 py-1.5 text-xs font-semibold transition hover:brightness-95 ${
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
