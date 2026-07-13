"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NAV_RESOURCE } from "@/lib/api/permissionsRegistry";

export interface MyPermissions {
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  permissions: string[];
  extras: string[];
}

const EMPTY: MyPermissions = {
  isAdmin: false,
  roleId: null,
  roleName: null,
  permissions: [],
  extras: [],
};

/**
 * Client-side mirror of the server permission gate. Fetches the caller's
 * effective (resource, action) set from `/api/me/permissions` and exposes
 * `has()` / `hasNav()` / `isAdmin` so components can hide buttons and whole
 * screens the user isn't entitled to. Admin short-circuits every check.
 */
export function useMyPermissions() {
  const [data, setData] = useState<MyPermissions>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me/permissions");
      const json = await res.json();
      setData(json?.data ?? EMPTY);
    } catch {
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const permSet = useMemo(() => new Set(data.permissions), [data.permissions]);

  const has = useCallback(
    (resource: string, action: string) => data.isAdmin || permSet.has(`${resource}:${action}`),
    [data.isAdmin, permSet],
  );

  const hasNav = useCallback(
    (href: string) => {
      const resource = NAV_RESOURCE[href];
      if (!resource) return true;
      if (resource === "Settings") return data.isAdmin;
      return data.isAdmin || permSet.has(`${resource}:view`);
    },
    [data.isAdmin, permSet],
  );

  return {
    loading,
    isAdmin: data.isAdmin,
    roleName: data.roleName,
    permissions: data.permissions,
    has,
    hasNav,
    refresh,
  };
}
