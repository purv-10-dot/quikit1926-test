"use client";

/**
 * Project-scoped route guard. Renders a "no access" panel unless the user
 * holds the given (resource, action) on this specific project (Layer 1 ∪
 * Layer 2). Tenant admins always pass.
 *
 * Use to wrap pages under `/spaces/[id]/*` that only certain project roles
 * should reach — e.g. per-project User Management is only for Space Admin /
 * tenant admin.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";

export function RequireProjectPerm({
  projectId,
  resource,
  action,
  children,
  redirectTo,
}: {
  projectId: string;
  resource: string;
  action: string;
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const perms = useMyProjectPermissions(projectId);
  const router = useRouter();
  const allowed = perms.has(resource, action);

  useEffect(() => {
    if (!perms.loading && !allowed && redirectTo) {
      router.replace(redirectTo);
    }
  }, [perms.loading, allowed, redirectTo, router]);

  if (perms.loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
        <span className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-amber-50 text-amber-600 mb-4">
          <Lock className="h-5 w-5" />
        </span>
        <h2 className="text-base font-semibold text-gray-900">
          You don&apos;t have access to this page
        </h2>
        <p className="mt-1 text-sm text-gray-500 max-w-md">
          Your role in this project does not include the{" "}
          <span className="font-medium text-gray-700">
            {resource}:{action}
          </span>{" "}
          permission. Ask the project lead or your organisation admin to grant it.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
