"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, FileSpreadsheet } from "lucide-react";
import { clsx } from "clsx";

const TABS = [
  { href: "/time-logs",    label: "Time Logs",   icon: <Clock size={14} /> },
  { href: "/timesheets",   label: "Timesheets",  icon: <FileSpreadsheet size={14} /> },
] as const;

export function TimeRecordsTabs() {
  const pathname = usePathname();
  return (
    <div className="surface-card p-1 inline-flex items-center gap-1 mb-4">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname?.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold transition",
              active
                ? "bg-[#16243A] text-white shadow-sm"
                : "text-gray-600 hover:text-[#16243A] hover:bg-gray-50",
            )}
          >
            {t.icon} {t.label}
          </Link>
        );
      })}
    </div>
  );
}
