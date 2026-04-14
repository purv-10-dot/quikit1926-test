"use client";

/**
 * OPSP Card primitives — extracted from the 2225-line `page.tsx` monolith.
 * These are presentational wrappers shared by every section of the OPSP form.
 */

import { cn } from "@/lib/utils";
import { Maximize2 } from "lucide-react";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border border-gray-200 rounded-lg p-4 bg-white",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardH({
  title,
  subtitle,
  expand,
  onExpand,
}: {
  title: string;
  subtitle?: string;
  expand?: boolean;
  onExpand?: () => void;
}) {
  return (
    <div className="flex items-start justify-between mb-3">
      <div>
        <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">
          {title}
        </p>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {expand && (
        <button
          onClick={onExpand}
          data-expand="true"
          className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
