"use client";

import { Tooltip } from "@/components/ui/Tooltip";

/**
 * Thin wrapper over the shared Tooltip primitive that shows a single-line
 * name / label when the trigger is hovered.
 */
export function NameTooltip({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <Tooltip
      triggerClassName="inline-block w-full"
      widthClass="max-w-xs"
      contentClassName="px-3 py-2"
      content={<p className="text-white leading-snug">{name}</p>}
    >
      {children}
    </Tooltip>
  );
}
