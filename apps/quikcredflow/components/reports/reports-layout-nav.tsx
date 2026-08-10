"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FolderOpen, LayoutDashboard, Wand2 } from "lucide-react";

const TABS = [
  { href: "/reports/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/reports/library", label: "Report library", icon: FolderOpen },
  { href: "/reports/builder", label: "Report builder", icon: Wand2 },
] as const;

export function ReportsLayoutNav() {
  const pathname = usePathname();
  const isReportRun =
    pathname.startsWith("/reports/") &&
    !TABS.some((t) => pathname === t.href || pathname === "/reports");

  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 border-b border-crm-border pb-2">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href ||
          (tab.href === "/reports/library" && pathname === "/reports");
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-accent-50 text-accent-700"
                : "text-crm-muted hover:bg-crm-panel hover:text-crm-text"
            }`}
          >
            <Icon size={16} />
            {tab.label}
          </Link>
        );
      })}
      {isReportRun && (
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-crm-muted">
          <BarChart3 size={14} />
          Report run
        </span>
      )}
    </nav>
  );
}
