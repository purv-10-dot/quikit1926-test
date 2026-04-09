"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { FilterProvider } from "@/lib/context/FilterContext";
import { SessionGuard } from "@/components/session-guard";
import { ThemeApplier } from "@quikit/ui/theme-applier";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SessionGuard>
    <ThemeApplier />
    <FilterProvider>
      <div className="flex h-screen bg-[var(--color-bg-secondary)]">
        {/* Sidebar - always visible on desktop, drawer on mobile */}
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Header */}
          <Header onMenuClick={() => setMobileOpen(!mobileOpen)} />

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto bg-[var(--color-bg-secondary)]">
            <div className="h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </FilterProvider>
    </SessionGuard>
  );
}
