"use client";

import { useState } from "react";
import { ThemeApplier } from "@quikit/ui/theme-applier";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

interface DashboardShellProps {
  children: React.ReactNode;
  permissions: string[];
  isAdmin: boolean;
  roleName: string | null;
  displayName: string;
  email: string | null;
}

export function DashboardShell({
  children,
  permissions,
  isAdmin,
  roleName,
  displayName,
  email,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <ThemeApplier />
      <div className="flex h-screen bg-[var(--color-bg-secondary)]">
        <Sidebar
          permissions={permissions}
          isAdmin={isAdmin}
          displayName={displayName}
          roleName={roleName}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            onMenuClick={() => setMobileOpen((v) => !v)}
            displayName={displayName}
            email={email}
          />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </>
  );
}
