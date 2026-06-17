"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRoles } from "@/lib/hooks/use-roles";
import { Home, Users2, Layers } from "lucide-react";
import { clsx } from "clsx";

interface Tab {
  href: string;
  label: string;
  icon: React.ReactNode;
  show: boolean;
}

export function WfhTabs() {
  const pathname = usePathname() ?? "";
  const { hasRole } = useRoles();
  const isSuperAdmin = hasRole("admin");
  const canManageQuota = isSuperAdmin || hasRole("admin");

  const tabs: Tab[] = [
    { href: "/wfh/my-requests", label: "My WFH", icon: <Home size={14} />, show: true },
    { href: "/wfh/team", label: "Team Approvals", icon: <Users2 size={14} />, show: true },
    { href: "/settings/wfh-quota", label: "Quota Groups", icon: <Layers size={14} />, show: canManageQuota },
  ];

  return (
    <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
      {tabs.filter((t) => t.show).map((t) => {
        const active = pathname === t.href || (t.href !== "/wfh/my-requests" && pathname.startsWith(t.href));
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              active
                ? "bg-[#16243A] text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            {t.icon} {t.label}
          </Link>
        );
      })}
    </div>
  );
}
