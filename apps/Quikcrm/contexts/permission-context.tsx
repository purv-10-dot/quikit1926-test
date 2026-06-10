"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ModuleAction, PermissionMatrix } from "@/types/permission";

interface PermissionContextValue {
  matrix: PermissionMatrix;
  can: (module: string, action: ModuleAction) => boolean;
  isAdmin: boolean;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({
  matrix,
  isAdmin,
  children,
}: {
  matrix: PermissionMatrix;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const value = useMemo<PermissionContextValue>(() => {
    return {
      matrix,
      isAdmin,
      can: (module, action) => {
        if (isAdmin) return true;
        const row = matrix.find((r) => r.module === module);
        return !!row && row.actions.includes(action);
      },
    };
  }, [matrix, isAdmin]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionContextValue {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error("usePermissions must be used inside <PermissionProvider>");
  return ctx;
}
