"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, User, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

export function AssetTabs() {
  const pathname = usePathname() ?? "";
  const { permissions } = useDashboardConfig();
  const isSuper = permissions.includes("*");
  const canReadAll = isSuper || permissions.includes("hrms.asset.read");
  const canReadSelf = isSuper || permissions.includes("hrms.asset.read_self");
  const canManage = isSuper || permissions.includes("hrms.asset.manage") || permissions.includes("hrms.asset.write");

  const tabs = [
    { href: "/assets", label: "Inventory", icon: <Package size={14} />, show: canReadAll },
    { href: "/assets/my-assets", label: "My Assets", icon: <User size={14} />, show: canReadSelf },
    { href: "/assets/scrap", label: "Scrap", icon: <Trash2 size={14} />, show: canManage },
  ];

  return (
    <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
      {tabs.filter((t) => t.show).map((t) => {
        const active = t.href === "/assets"
          ? pathname === "/assets"
          : pathname.startsWith(t.href);
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
