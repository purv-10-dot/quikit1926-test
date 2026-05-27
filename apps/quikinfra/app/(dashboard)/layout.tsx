"use client";

import { QuikInfraShell } from "@/components/QuikInfraShell";

/**
 * Dashboard layout — uses the shared @quikit/app-shell via QuikInfraShell.
 *
 * QuikInfraShell provides the standard Quikit header (with app catalog,
 * Cmd+K search, notifications, user menu) and sidebar (with collapsible
 * nav groups and permission-aware rendering).
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QuikInfraShell>
      {children}
    </QuikInfraShell>
  );
}
