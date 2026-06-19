"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Receipt, ShieldCheck, FileBarChart } from "lucide-react";
import { clsx } from "clsx";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

export function ExpenseTabs() {
  const pathname = usePathname() ?? "";
  const { permissions } = useDashboardConfig();
  const isSuper = permissions.includes("*");
  const canManage = isSuper || permissions.includes("hrms.expense.manage");
  const canReadAll = isSuper || permissions.includes("hrms.expense.read");

  const tabs = [
    { href: "/expenses", label: "Claims", icon: <Receipt size={14} />, show: true },
    { href: "/expenses/policies", label: "Policies", icon: <ShieldCheck size={14} />, show: canManage },
    { href: "/expenses/reports", label: "Reports", icon: <FileBarChart size={14} />, show: canReadAll },
  ];

  return (
    <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
      {tabs.filter((t) => t.show).map((t) => {
        const active = t.href === "/expenses"
          ? pathname === "/expenses"
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
