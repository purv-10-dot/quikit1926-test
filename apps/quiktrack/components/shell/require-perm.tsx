"use client";

/**
 * Client-side route guard for global (non-project-scoped) pages.
 *
 * Renders a "no access" panel when the current user lacks the required
 * (resource, action) on their app-wide role. Use to wrap the *content* of
 * top-level pages like /timesheet and /reports — the sidebar already hides
 * the nav rows, but a user can still navigate directly via URL.
 *
 * For project-scoped routes use `useMyProjectPermissions` + the layout
 * guard at app/(dashboard)/spaces/[id]/layout.tsx instead.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

export function RequirePerm({
  resource,
  action,
  adminOnly,
  children,
  /** Optional — bounce to this href instead of rendering the deny panel. */
  redirectTo,
}: {
  resource?: string;
  action?: string;
  /** Pass `true` to require app-wide admin role (overrides resource/action). */
  adminOnly?: boolean;
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const perms = useMyPermissions();
  const router = useRouter();
  const allowed = adminOnly
    ? perms.isAdmin
    : resource && action
      ? perms.has(resource, action)
      : false;

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
          {adminOnly ? (
            <>
              This page is available to organisation{" "}
              <span className="font-medium text-gray-700">admins</span> only.
            </>
          ) : (
            <>
              Your role does not include the{" "}
              <span className="font-medium text-gray-700">
                {resource}:{action}
              </span>{" "}
              permission. Ask your organisation admin to grant it.
            </>
          )}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
