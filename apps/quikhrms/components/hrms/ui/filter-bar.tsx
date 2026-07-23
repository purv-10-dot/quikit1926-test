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

export function FilterPills<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center bg-gray-100 rounded-md p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={clsx(
            "px-3 py-1.5 text-xs font-semibold rounded transition",
            value === opt.value
              ? "bg-white text-[#166534] shadow-sm"
              : "text-gray-500 hover:text-gray-800",
          )}
        >
          {opt.label}
        </button>
      ))}
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
