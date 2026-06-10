"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, History, Zap } from "lucide-react";

const TABS = [
  { href: "/settings/notifications", label: "Overview", icon: Activity, exact: true },
  { href: "/settings/notifications/rules", label: "Rules", icon: Zap, exact: false },
];

export function NotificationsSubNav() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex items-center gap-1 border-b border-crm-border">
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={[
              "flex items-center gap-2 border-b-2 px-3 pb-3 pt-1 text-sm font-medium transition-colors",
              active
                ? "border-crm-blue text-crm-blue"
                : "border-transparent text-crm-muted hover:text-crm-text",
            ].join(" ")}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={15} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
