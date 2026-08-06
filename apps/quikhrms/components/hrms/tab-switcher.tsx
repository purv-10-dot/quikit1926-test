"use client";

import { clsx } from "clsx";

interface TabItem<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** Optional count badge (e.g. Pending (3)). */
  count?: number;
}

interface TabSwitcherProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * App-wide status/section toggle — the pill-in-card style used on Offboarding.
 * Active tab = solid green pill; inactive = quiet grey with green hover.
 * Supports an optional icon and a count badge per tab.
 */
export function TabSwitcher<T extends string>({ tabs, value, onChange, className }: TabSwitcherProps<T>) {
  return (
    <div className={clsx("surface-card p-1 inline-flex items-center gap-1 flex-wrap", className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-semibold transition",
              active ? "bg-green-600 text-white shadow-sm" : "text-gray-600 hover:text-[#166534] hover:bg-gray-50",
            )}
          >
            {t.icon}
            {t.label}
            {t.count != null && (
              <span
                className={clsx(
                  "ml-0.5 inline-flex items-center justify-center min-w-[1.15rem] h-[1.05rem] px-1 rounded-full text-[11px] font-semibold tabular-nums",
                  active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
