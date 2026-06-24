"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ProjectHeader } from "./_components/project-header";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { useApiData } from "@/lib/hooks/useApiData";
import {
  TAB_ROUTE_GATES,
  isProjectTabPath,
  isTabEnabled,
  enabledTabPaths,
} from "@/lib/projectTabs";

/**
 * A sub-route under /spaces/[id]/<segment> is blocked (and the user bounced to a
 * safe tab) when EITHER:
 *   - their role lacks the tab's entity perm (Layer 1 ∪ Layer 2), or
 *   - the project's admin has hidden that tab via the tab customizer
 *     (QtProject.tabConfig).
 * Both gates are kept in sync with the tab bar in project-header.tsx via the
 * shared registry in lib/projectTabs.ts, so a direct URL visit can't bypass
 * either. Settings and the full-page work-item view are exempt.
 */
export default function SpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const perms = useMyProjectPermissions(params.id);
  // tabConfig: undefined while loading, then string[] (enabled paths) or null
  // (unconfigured → all tabs). Shares React Query cache with the header's fetch.
  const { data: tabConfig } = useApiData<string[] | null>(
    ["quiktrack", "project-tabconfig", params.id],
    `/api/projects/${params.id}`,
    { select: (d) => (d as { tabConfig?: string[] | null } | null)?.tabConfig ?? null },
  );
  const configLoaded = tabConfig !== undefined;

  const isSettings = pathname?.startsWith(`/spaces/${params.id}/settings`) ?? false;
  // Full-page issue view (/spaces/<id>/work/<issueId>) renders its own
  // breadcrumb, so the project tab bar is suppressed to match the Jira
  // single-issue layout.
  const isWorkItem = pathname?.startsWith(`/spaces/${params.id}/work/`) ?? false;

  // Resolve the sub-route segment (e.g. "timesheet" in /spaces/abc/timesheet).
  const segment = pathname?.split("/")[3] ?? "";
  const isTab = isProjectTabPath(segment);
  const gate = TAB_ROUTE_GATES[segment];

  const roleForbidden = isTab && !perms.loading && !!gate && !perms.has(gate.resource, gate.action);
  const tabDisabled = isTab && configLoaded && !isTabEnabled(tabConfig ?? null, segment);

  // First tab that is BOTH enabled by the project AND permitted for this role —
  // the safe redirect target (avoids bouncing to a tab that's itself blocked,
  // which would loop).
  const fallbackPath = useMemo(() => {
    if (perms.loading || !configLoaded) return "summary";
    const visible = enabledTabPaths(tabConfig ?? null).filter((p) => {
      const g = TAB_ROUTE_GATES[p];
      return !g || perms.has(g.resource, g.action);
    });
    return visible[0] ?? "summary";
  }, [perms, configLoaded, tabConfig]);

  useEffect(() => {
    if (isSettings || isWorkItem || !isTab) return;
    if (perms.loading || !configLoaded) return;
    if ((roleForbidden || tabDisabled) && segment !== fallbackPath) {
      router.replace(`/spaces/${params.id}/${fallbackPath}`);
    }
  }, [
    isSettings, isWorkItem, isTab, perms.loading, configLoaded,
    roleForbidden, tabDisabled, segment, fallbackPath, router, params.id,
  ]);

  // While verifying / before the redirect fires, don't render the blocked
  // sub-route — avoids a flash of forbidden or hidden content.
  if (!isSettings && !isWorkItem && isTab && !perms.loading && configLoaded && (roleForbidden || tabDisabled)) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500">
        {roleForbidden
          ? "You don't have access to this view."
          : "This tab isn't available for this project."}
      </div>
    );
  }

  if (isSettings || isWorkItem) {
    return <div className="h-full bg-white overflow-y-auto">{children}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-shrink-0 bg-white">
        <ProjectHeader projectId={params.id} />
      </div>
      <div className="flex-1 overflow-y-auto bg-white min-w-0">{children}</div>
    </div>
  );
}
