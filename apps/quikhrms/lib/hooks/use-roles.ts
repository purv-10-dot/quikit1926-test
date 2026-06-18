"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";

export const ALL_ROLES = [
  "admin",
  "employee",
] as const;

export type Role = (typeof ALL_ROLES)[number];

const STORAGE_KEY = "hrms.roles";
const IMPERSONATE_KEY = "hrms.roles.impersonate";
const DEFAULT: Role[] = ["employee"];

const PRIORITY: Role[] = ["admin", "employee"];

function readImpersonation(): Role[] | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(IMPERSONATE_KEY) ?? localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean) as Role[];
  const valid = parts.filter((p) => (ALL_ROLES as readonly string[]).includes(p));
  return valid.length ? valid : null;
}

export function primaryRole(roles: Role[]): Role {
  for (const r of PRIORITY) if (roles.includes(r)) return r;
  return "employee";
}

export function writeRoles(roles: Role[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(IMPERSONATE_KEY, roles.join(","));
  localStorage.setItem(STORAGE_KEY, roles.join(","));
  window.dispatchEvent(new Event("hrms:roles-changed"));
}

export function clearImpersonation() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(IMPERSONATE_KEY);
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("hrms:roles-changed"));
}

/**
 * Roles source of truth:
 *   1. localStorage impersonation (dev tool)
 *   2. DB-assigned role from /dashboard/config
 *   3. DEFAULT (employee)
 */
export function useRoles() {
  const api = useApiClient();
  const [impersonated, setImpersonated] = useState<Role[] | null>(null);

  const { data } = useQuery({
    queryKey: ["dashboard", "config"],
    queryFn: () => api.get<{ role: { code: string } }>("/api/v1/hrms/dashboard/config"),
    staleTime: 60_000,
  });
  const dbRoleCode = data?.data?.role?.code as Role | undefined;

  useEffect(() => {
    setImpersonated(readImpersonation());
    const onChange = () => setImpersonated(readImpersonation());
    window.addEventListener("hrms:roles-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("hrms:roles-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const roles: Role[] = impersonated
    ?? (dbRoleCode && (ALL_ROLES as readonly string[]).includes(dbRoleCode) ? [dbRoleCode] : DEFAULT);

  const setRoles = (next: Role[]) => {
    if (next.length === 0) clearImpersonation();
    else writeRoles(next);
  };

  return {
    roles,
    primary: primaryRole(roles),
    dbRole: dbRoleCode ?? null,
    isImpersonating: impersonated !== null,
    setRoles,
    clearImpersonation,
    hasRole: (r: Role) => roles.includes(r),
  };
}

export function hasAnyRole(roles: Role[], required: string[] | undefined): boolean {
  if (!required || required.length === 0) return true;
  return required.some((r) => roles.includes(r as Role));
}
