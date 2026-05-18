"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@quikit/ui";

const TABS = [
  { href: "/org-setup/users", label: "Users" },
  { href: "/org-setup/roles", label: "Roles & Permissions" },
];

export function OrgSetupTabs() {
  const pathname = usePathname();
  return (
    <nav className="mt-4 flex gap-1 border-b border-gray-200 -mb-px">
      {TABS.map((tab) => {
        const active = pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
              active
                ? "border-accent-600 text-accent-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
