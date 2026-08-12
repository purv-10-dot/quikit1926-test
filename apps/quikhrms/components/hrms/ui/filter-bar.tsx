"use client";

import { Search } from "lucide-react";
import { clsx } from "clsx";
import type { ReactNode } from "react";

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
      {children}
    </div>
  );
}

export function FilterDivider() {
  return <div className="h-5 w-px bg-gray-200" />;
}

export function FilterSearch({
  value,
  onChange,
  placeholder = "Search...",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={clsx("relative ml-auto min-w-[220px]", className)}>
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full ds-control !pl-9"
      />
    </div>
  );
}

export function FilterField({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {icon}
      {children}
    </div>
  );
}
