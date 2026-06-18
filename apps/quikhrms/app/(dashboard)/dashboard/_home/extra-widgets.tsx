"use client";

import Link from "next/link";
import {
  ChevronRight as ChevronRightIcon,
  Wallet, ScrollText, Receipt, FileText, LifeBuoy, Smartphone,
} from "lucide-react";

export function QuickLinksWidget() {
  const links = [
    { label: "My Payslip", icon: <Wallet size={14} />, href: "/payroll/my-payslips" },
    { label: "Leave Balance", icon: <ScrollText size={14} />, href: "/leaves/my-leaves" },
    { label: "Tax Declaration (12BB)", icon: <Receipt size={14} />, href: "/payroll/form12bb" },
    { label: "Tax computation", icon: <FileText size={14} />, href: "/payroll/form16" },
    { label: "Help & Support", icon: <LifeBuoy size={14} />, href: "/tasks" },
  ];

  return (
    <div className="surface-card p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-3">Quick Links</h3>
      <div className="space-y-1">
        {links.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className="flex items-center justify-between px-2.5 py-2.5 rounded-lg hover:bg-gray-50 transition group"
          >
            <span className="flex items-center gap-2.5 text-sm text-gray-700 group-hover:text-blue-600">
              <span className="text-gray-500 group-hover:text-blue-600">{l.icon}</span>
              {l.label}
            </span>
            <ChevronRightIcon size={14} className="text-gray-400 group-hover:text-blue-600" />
          </Link>
        ))}
      </div>
    </div>
  );
}

export function MobileAppWidget() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 ring-1 ring-gray-200 p-5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900">Download Mobile App</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Access HRMS on the go</p>
          <button className="mt-3 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition">
            Download Now
          </button>
        </div>
        <div className="relative shrink-0">
          <div className="w-14 h-20 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md">
            <Smartphone size={26} className="text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
