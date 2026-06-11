"use client";

import type { ReactNode } from "react";
import { ConfirmProvider } from "@quikit/ui";
import { AuthProvider, type AuthUser } from "@/contexts/auth-context";
import { PermissionProvider } from "@/contexts/permission-context";
import { ToastProvider } from "@/contexts/toast-context";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import type { PermissionMatrix } from "@/types/permission";

export function DashboardProviders({
  user,
  matrix,
  isAdmin,
  children,
}: {
  user: AuthUser;
  matrix: PermissionMatrix;
  isAdmin: boolean;
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <AuthProvider initialUser={user}>
        <PermissionProvider matrix={matrix} isAdmin={isAdmin}>
          <ConfirmProvider>
            <SidebarProvider>{children}</SidebarProvider>
          </ConfirmProvider>
        </PermissionProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
