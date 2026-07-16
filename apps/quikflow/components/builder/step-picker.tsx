"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { STEP_KINDS } from "@/lib/catalog";
import { nodeMeta } from "@/lib/builder/node-meta";
import { cn } from "@/lib/utils";

/**
 * "Add step" affordance for the builder canvas: a dashed button that opens a
 * centered overlay menu of step kinds (icon + hint per kind). Rendered as a
 * fixed overlay so it is never clipped by the canvas's horizontal scroll.
 * Calls `onAdd` with the chosen kind, then closes.
 */
export function StepPicker({ onAdd }: { onAdd: (kind: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-sm font-medium transition-colors",
          "border-[var(--color-border)] text-gray-500 hover:border-accent-400 hover:text-accent-600",
        )}
      >
        <Plus className="h-5 w-5" />
        Add step
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 px-1 text-sm font-semibold">Add a step</p>
            <div className="space-y-1">
              {STEP_KINDS.map((k) => {
                const meta = nodeMeta(k.kind);
                const Icon = meta.icon;
                return (
                  <button
                    key={k.kind}
                    type="button"
                    onClick={() => {
                      onAdd(k.kind);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--color-bg-secondary)]"
                  >
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meta.chip)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{k.label}</span>
                      <span className="block text-xs text-gray-500">{k.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
