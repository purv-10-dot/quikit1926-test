"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

interface RequirePermProps {
  children: React.ReactNode;
  /** Gate on a specific (resource, action). */
  resource?: string;
  action?: string;
  /** Gate on org/app admin only (ignores resource/action). */
  adminOnly?: boolean;
}

/**
 * Client route/section guard. Mirrors quiktrack's <RequirePerm>: shows a
 * spinner while permissions load, a deny panel when the check fails, and the
 * children only when the caller is entitled. The APIs enforce the same rules
 * server-side — this is UX, not the security boundary.
 */
export function RequirePerm({ children, resource, action, adminOnly }: RequirePermProps) {
  const { loading, isAdmin, has } = useMyPermissions();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-sm">Checking access…</span>
      </div>
    );
  }

  const allowed = adminOnly
    ? isAdmin
    : resource && action
      ? has(resource, action)
      : isAdmin;

  if (!allowed) {
    return (
      <div className="p-4 sm:p-6">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white px-8 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <ShieldAlert className="h-6 w-6 text-red-500" />
          </div>
          <h2 className="text-sm font-semibold text-gray-800">Access restricted</h2>
          <p className="text-xs leading-relaxed text-gray-500">
            You don&apos;t have permission to view this page. Contact an organisation
            administrator if you believe this is a mistake.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
