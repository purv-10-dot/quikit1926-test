"use client";

import { useRef, useState } from "react";
import { ChevronsUp, ChevronUp, Equal, ChevronDown, ChevronsDown } from "lucide-react";
import { PopoverPanel } from "./popover-panel";

const PRIORITY_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  HIGHEST: { label: "Highest", icon: ChevronsUp, tone: "text-red-600" },
  HIGH: { label: "High", icon: ChevronUp, tone: "text-orange-600" },
  MEDIUM: { label: "Medium", icon: Equal, tone: "text-amber-600" },
  LOW: { label: "Low", icon: ChevronDown, tone: "text-sky-600" },
  LOWEST: { label: "Lowest", icon: ChevronsDown, tone: "text-blue-600" },
};

const ORDER = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"] as const;

interface PriorityCellProps {
  value: string;
  onCommit: (priority: string) => void;
}

export function PriorityCell({ value, onCommit }: PriorityCellProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const meta = PRIORITY_META[value] ?? PRIORITY_META.MEDIUM;
  const Icon = meta.icon;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs hover:bg-gray-100 focus:outline-none focus-visible:outline-none dark:hover:bg-slate-700/50"
      >
        <Icon className={`h-3.5 w-3.5 ${meta.tone}`} />
        <span className="text-gray-700">{meta.label}</span>
      </button>
      <PopoverPanel anchorRef={btnRef} open={open} onClose={() => setOpen(false)} width={140}>
        {ORDER.map((p) => {
          const m = PRIORITY_META[p];
          const Pi = m.icon;
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                setOpen(false);
                if (p !== value) onCommit(p);
              }}
              className={`w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-gray-50 ${
                p === value ? "bg-gray-50" : ""
              }`}
            >
              <Pi className={`h-3.5 w-3.5 ${m.tone}`} />
              <span>{m.label}</span>
            </button>
          );
        })}
      </PopoverPanel>
    </>
  );
}
