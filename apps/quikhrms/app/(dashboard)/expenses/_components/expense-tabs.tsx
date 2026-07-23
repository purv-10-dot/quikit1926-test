"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Receipt, ShieldCheck, FileBarChart, CheckSquare } from "lucide-react";
import { clsx } from "clsx";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { useApiClient } from "@/lib/hooks/use-api";

export function ExpenseTabs() {
  const api = useApiClient();
  const pathname = usePathname() ?? "";
  const activeTab = useSearchParams()?.get("tab") ?? "";
  const { permissions, navKeys } = useDashboardConfig();
  const isSuper = permissions.includes("*");
  const canManage = isSuper || permissions.includes("hrms.expense.manage");
  const canReadAll = isSuper || permissions.includes("hrms.expense.read");
  const canApprove = isSuper || permissions.includes("hrms.expense.approve");

  // Per-tab navigation allow-list (mirrors the sidebar). Default-allow — a role
  // with no configured navKeys (or super-admin) sees every tab. Legacy
  // "expenses" key grants all tabs for older role configs.
  const navSet = new Set(navKeys);
  const navConfigured = !isSuper && navSet.size > 0;
  const legacyAll = navSet.has("expenses");
  const navAllowed = (key: string) => !navConfigured || legacyAll || navSet.has(key);

  // Count of claims awaiting THIS user's approval — powers the tab badge.
  const { data: pending } = useQuery({
    queryKey: ["expenses", "pending-approvals-count"],
    queryFn: () =>
      api
        .get<{ id: string }[]>("/api/v1/hrms/expenses/claims/pending-approvals")
        .catch(() => ({ data: [] as { id: string }[] })),
    enabled: canApprove,
    staleTime: 60_000,
  });
  const approvalCount = Array.isArray(pending?.data) ? pending.data.length : 0;

  const tabs = [
    { href: "/expenses", label: "Claims", icon: <Receipt size={13} />, show: navAllowed("expenses.claims"), isApprovals: false },
    { href: "/expenses?tab=approvals", label: "Approvals", icon: <CheckSquare size={13} />, show: canApprove && navAllowed("expenses.approvals"), isApprovals: true },
    { href: "/expenses/policies", label: "Policies", icon: <ShieldCheck size={13} />, show: canManage && navAllowed("expenses.policies"), isApprovals: false },
    { href: "/expenses/reports", label: "Reports", icon: <FileBarChart size={13} />, show: canReadAll && navAllowed("expenses.reports"), isApprovals: false },
  ];

  return (
    <div className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
      {tabs.filter((t) => t.show).map((t) => {
        // Claims + Approvals share the /expenses path, disambiguated by ?tab.
        const active =
          t.href === "/expenses"
            ? pathname === "/expenses" && activeTab !== "approvals"
            : t.isApprovals
              ? pathname === "/expenses" && activeTab === "approvals"
              : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all",
              active
                ? "bg-green-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            {t.icon} {t.label}
            {t.isApprovals && approvalCount > 0 && (
              <span
                className={clsx(
                  "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold",
                  active ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700",
                )}
              >
                {approvalCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
