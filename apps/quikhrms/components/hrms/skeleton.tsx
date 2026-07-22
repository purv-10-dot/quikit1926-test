"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";

interface SkeletonProps {
  className?: string;
  variant?: "default" | "brand";
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  style?: React.CSSProperties;
}

/**
 * Base shimmer block — compose higher-level skeletons out of these.
 */
export function Skeleton({ className, variant = "default", rounded = "md", style }: SkeletonProps) {
  const roundCls =
    rounded === "none" ? "rounded-none" :
    rounded === "sm" ? "rounded-sm" :
    rounded === "md" ? "rounded-md" :
    rounded === "lg" ? "rounded-lg" :
    "rounded-full";
  return (
    <div
      style={style}
      className={clsx(
        variant === "brand" ? "shimmer-brand" : "shimmer",
        roundCls,
        className,
      )}
    />
  );
}

/** Single text line */
export function SkeletonLine({ w = "80%", h = 12 }: { w?: string | number; h?: number }) {
  return <div className="shimmer rounded-sm" style={{ width: w, height: h }} />;
}

/** Row of metric cards (dashboard header) */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <Skeleton className="w-20 h-3" rounded="sm" />
            <Skeleton className="w-7 h-7" rounded="md" variant="brand" />
          </div>
          <Skeleton className="w-24 h-6" rounded="md" />
          <Skeleton className="w-16 h-2.5" rounded="sm" />
        </div>
      ))}
    </div>
  );
}

/** Table skeleton: header row + n body rows */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" rounded="sm" />
        ))}
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 py-3 flex items-center gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="flex-1">
                <Skeleton
                  className="h-4"
                  rounded="sm"
                  style={{ width: `${50 + ((r + c) * 13) % 40}%` }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Card grid skeleton */
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10" rounded="full" variant="brand" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="w-32 h-3.5" rounded="sm" />
              <Skeleton className="w-20 h-2.5" rounded="sm" />
            </div>
          </div>
          <div className="space-y-1.5 pt-1">
            <Skeleton className="w-full h-2.5" rounded="sm" />
            <Skeleton className="w-[85%] h-2.5" rounded="sm" />
            <Skeleton className="w-[60%] h-2.5" rounded="sm" />
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            <Skeleton className="w-16 h-5" rounded="sm" />
            <Skeleton className="w-12 h-5" rounded="sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Full page shimmer — header + stats + body */
export function SkeletonPage({ variant = "table" }: { variant?: "table" | "cards" | "detail" }) {
  return (
    <div className="fade-in-content">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-2">
          <Skeleton className="w-48 h-6" rounded="md" />
          <Skeleton className="w-64 h-3" rounded="sm" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="w-24 h-9" rounded="md" />
          <Skeleton className="w-32 h-9" rounded="md" variant="brand" />
        </div>
      </div>

      <SkeletonStats count={4} />

      {variant === "table" && <SkeletonTable rows={6} cols={5} />}
      {variant === "cards" && <SkeletonCards count={6} />}
      {variant === "detail" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
              <Skeleton className="w-40 h-4" rounded="sm" />
              <div className="grid grid-cols-2 gap-3 pt-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="w-20 h-2.5" rounded="sm" />
                    <Skeleton className="w-full h-3.5" rounded="sm" />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="w-full h-3" rounded="sm" />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
              <Skeleton className="w-24 h-20" rounded="full" variant="brand" />
              <Skeleton className="w-32 h-4" rounded="sm" />
              <Skeleton className="w-24 h-3" rounded="sm" />
            </div>
            <SkeletonCards count={2} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SkeletonSwap — crossfade between a skeleton and real content.
 *
 * Usage:
 *   <SkeletonSwap loading={q.isLoading} skeleton={<MyListSkeleton />}>
 *     <MyList items={q.data} />
 *   </SkeletonSwap>
 *
 * When `loading` flips to false, the skeleton fades out (180 ms) while the
 * content fades in (220 ms) on top. The skeleton is removed from the DOM
 * after the fade completes.
 */
const SKELETON_FADE_MS = 180;

export function SkeletonSwap({
  loading,
  skeleton,
  children,
  className,
}: {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [showSkeleton, setShowSkeleton] = useState(loading);
  const [fadingOut, setFadingOut] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (loading) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      setShowSkeleton(true);
      setFadingOut(false);
    } else if (showSkeleton) {
      setFadingOut(true);
      timer.current = setTimeout(() => {
        setShowSkeleton(false);
        setFadingOut(false);
      }, SKELETON_FADE_MS);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [loading, showSkeleton]);

  if (showSkeleton) {
    return (
      <div className={clsx("relative", className)}>
        <div className={fadingOut ? "fade-out-content" : undefined}>{skeleton}</div>
      </div>
    );
  }

  return (
    <div className={clsx("fade-in-content", className)}>{children}</div>
  );
}

/** Form skeleton — vertical field groups */
export function SkeletonForm({ groups = 3, fieldsPerGroup = 3 }: { groups?: number; fieldsPerGroup?: number }) {
  return (
    <div className="space-y-4 fade-in-content">
      {Array.from({ length: groups }).map((_, g) => (
        <div key={g} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <Skeleton className="w-32 h-4" rounded="sm" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: fieldsPerGroup }).map((_, f) => (
              <div key={f} className="space-y-1.5">
                <Skeleton className="w-20 h-2.5" rounded="sm" />
                <Skeleton className="w-full h-9" rounded="md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
