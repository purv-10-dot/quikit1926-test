"use client";

import { type ReactNode } from "react";
import { useIntersection } from "@/lib/hooks/use-intersection";

/**
 * Renders children only when scrolled into viewport (+ 200px margin).
 * Prevents below-fold widgets from firing API calls on mount.
 */
export function DeferredSection({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { ref, isVisible } = useIntersection();

  return (
    <div ref={ref}>
      {isVisible ? children : (fallback ?? <div className="h-32 animate-pulse rounded-lg bg-gray-100" />)}
    </div>
  );
}
