"use client";

import {
  LayoutDashboard,
  Building2,
  ShoppingCart,
  Warehouse,
  DollarSign,
  Users,
  ShieldAlert,
  ClipboardCheck,
  Settings,
  FileText,
  CheckSquare,
  BarChart3,
  Paperclip,
  FileClock,
} from "lucide-react";
import { AppSidebar, type NavItem } from "@quikit/ui";
import { ToastProvider } from "@/components/ui/Toast";

const NAV: NavItem[] = [
  { label: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard },
  { label: "Projects",   href: "/projects",   icon: Building2 },
  { label: "Purchase",   href: "/purchase",   icon: ShoppingCart },
  { label: "Store",      href: "/store",      icon: Warehouse },
  { label: "Finance",    href: "/finance",    icon: DollarSign },
  { label: "HRMS",       href: "/hrms",       icon: Users },
  { label: "Safety",     href: "/safety",     icon: ShieldAlert },
  { label: "Quality",    href: "/quality",    icon: ClipboardCheck },
  { label: "Masters",    href: "/masters",    icon: FileText },
  { label: "Approvals",  href: "/approvals",  icon: CheckSquare },
  { label: "Reports",    href: "/reports",    icon: BarChart3 },
  { label: "Documents",  href: "/documents",  icon: Paperclip },
  { label: "Audit Log",  href: "/audit",      icon: FileClock },
  { label: "Settings",   href: "/settings",   icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex h-screen bg-gray-50">
        <AppSidebar
          brand={{ name: "QuikConstruction", subtitle: "ERP Suite", icon: Building2 }}
          nav={NAV}
          storageKey="quikconstruction.sidebar"
          footer={<div className="flex items-center justify-between"><span>v1.0</span><span>:3007</span></div>}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </ToastProvider>
  );
}
