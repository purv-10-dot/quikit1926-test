"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { OPSPDeadlineBanner } from "@/components/dashboard/opsp-deadline-banner";
import { DemoDataBanner } from "@/components/dashboard/demo-data-banner";
import { FilterProvider } from "@/lib/context/FilterContext";
import { SessionGuard } from "@/components/session-guard";
import { ThemeApplier } from "@quikit/ui/theme-applier";
import { FeatureDisabledToast, ImpersonationBanner } from "@quikit/ui";
import { QuarterRequiredGuard } from "@/components/quarter-required-guard";
import { QuikScaleTour } from "@/components/tour/quikscale-tour";
import { Toaster } from "sonner";

/**
 * Client shell for the dashboard. The server `layout.tsx` performs the
 * app-access gate BEFORE rendering this, so a user without QuikScale access
 * never sees any of the chrome below — not even for a frame. SessionGuard stays
 * as the live-revalidation backstop (access revoked while already inside).
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SessionGuard>
    <ThemeApplier />
    <ImpersonationBanner />
    <FeatureDisabledToast />
    <QuikScaleTour />
    <Toaster
      richColors
      closeButton
      position="top-right"
      toastOptions={{ classNames: { toast: "qs-toast", closeButton: "qs-toast-close" } }}
    />
    <FilterProvider>
      <div className="flex h-screen bg-[var(--color-bg-secondary)]">
        {/* Sidebar - always visible on desktop, drawer on mobile */}
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Header */}
          <Header onMenuClick={() => setMobileOpen(!mobileOpen)} />

          {/* OPSP Deadline Banner — global, shows when threshold is active */}
          <OPSPDeadlineBanner />

          {/* Demo Data Banner — global, shows while the org has seeded sample data */}
          <DemoDataBanner />

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto bg-[var(--color-bg-secondary)]">
            <div className="h-full">
              <QuarterRequiredGuard>
                {children}
              </QuarterRequiredGuard>
            </div>
          </main>
        </div>
      </div>
    </FilterProvider>
    </SessionGuard>
  );
}
