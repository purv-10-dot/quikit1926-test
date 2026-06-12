"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/leads", label: "All Leads", match: (p: string) => p === "/leads" || p.startsWith("/leads/") && !p.startsWith("/leads/lists") && !p.startsWith("/leads/kanban") },
  { href: "/leads/lists", label: "Lists", match: (p: string) => p.startsWith("/leads/lists") },
  { href: "/leads/kanban", label: "Kanban", match: (p: string) => p.startsWith("/leads/kanban") },
];

export function LeadsTabBar() {
  const pathname = usePathname();
  return (
    <div className="mb-2 flex items-center gap-1">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              "rounded-lg px-3 py-1 text-sm font-medium transition lg:py-1.5 " +
              (active
                ? "bg-crm-blue text-white shadow-sm"
                : "text-crm-text hover:bg-crm-panel")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
