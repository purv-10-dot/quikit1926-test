"use client";

import { Tooltip } from "@/components/ui/Tooltip";

/**
 * Shows the KPI's latest note (or falls back to its description) on hover.
 * When no description AND no last-note exist, the trigger renders alone.
 */
export function DescTooltip({
  description,
  lastNotes,
  lastNotesAt,
  children,
}: {
  description?: string | null;
  lastNotes?: string | null;
  lastNotesAt?: string | null;
  children: React.ReactNode;
}) {
  const text = lastNotes || description;
  if (!text) return <>{children}</>;

  return (
    <Tooltip
      widthClass="w-64"
      contentClassName="p-2.5"
      content={
        <>
          <p className="font-medium mb-1 text-gray-200">Last Note</p>
          <p className="text-gray-300 line-clamp-4">{text}</p>
          {lastNotesAt && (
            <p className="text-gray-500 mt-1.5 text-[10px]">
              {new Date(lastNotesAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
        </>
      }
    >
      {children}
    </Tooltip>
  );
}
