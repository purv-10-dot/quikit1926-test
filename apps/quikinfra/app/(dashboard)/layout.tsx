"use client";

import { QuikInfraShell } from "@/components/QuikInfraShell";
import { SessionGuard } from "@/components/session-guard";

/**
 * Dashboard layout — uses the shared @quikit/app-shell via QuikInfraShell.
 *
 * QuikInfraShell provides the standard Quikit header (with app catalog,
 * Cmd+K search, notifications, user menu) and sidebar (with collapsible
 * nav groups and permission-aware rendering).
 *
 * <SessionGuard> enforces runtime app-access (OrgAppAccess / UserAppAccess),
 * matching quikscale / quiktrack — users without QuikInfra access are bounced
 * to the launcher /apps instead of seeing the dashboard.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionGuard>
      <QuikInfraShell>
        {children}
      </QuikInfraShell>
    </SessionGuard>
  );
}
