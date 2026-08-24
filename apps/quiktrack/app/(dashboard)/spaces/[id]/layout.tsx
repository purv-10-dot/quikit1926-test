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
  selectableTabs,
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
  // Whole-project fetch used purely to detect a deleted / inaccessible space.
  // The API returns 404 when the project is gone or the caller can't see it;
  // useApiData throws on !ok, so `isError` is our "space not found" signal.
  // Without this a deleted space (e.g. arrived via the browser Back button)
  // leaves every tab stuck on its loading shimmer instead of saying so.
  // staleTime 0 so this always re-validates on mount instead of serving a stale
  // cached success — a space deleted moments ago (then reached via Back) must
  // show "not found" immediately, not after the default 60s cache window.
  const projectQuery = useApiData<unknown>(
    ["quiktrack", "project-detail", params.id],
    `/api/projects/${params.id}`,
    // staleTime 0 → always re-validate on mount (no stale cached success).
    // retry false → a 404 is authoritative; retrying would only delay the
    // "not found" message by several seconds of backoff.
    { staleTime: 0, retry: false },
  );
  const projectMissing = projectQuery.isError;
  // tabConfig: undefined while loading, then string[] (enabled paths) or null
  // (unconfigured → all tabs). Shares React Query cache with the header's fetch.
  const { data: tabConfig } = useApiData<string[] | null>(
    ["quiktrack", "project-tabconfig", params.id],
    `/api/projects/${params.id}`,
    { select: (d) => (d as { tabConfig?: string[] | null } | null)?.tabConfig ?? null },
  );
  const { data: templateKey } = useApiData<string | null>(
    ["quiktrack", "project-templatekey", params.id],
    `/api/projects/${params.id}`,
    { select: (d) => (d as { templateKey?: string | null } | null)?.templateKey ?? null },
  );
  const configLoaded = tabConfig !== undefined;

  // Canonicalize the URL to the readable project KEY. Any link that still uses
  // the project UUID (or a deep-link that resolved to an id) is rewritten in
  // place to /spaces/<KEY>/... so the address bar never exposes the UUID and
  // navigation from that page stays on the readable key. Routes accept either
  // form, so this is purely cosmetic + keeps the URL stable.
  const { data: projectKey } = useApiData<string | null>(
    ["quiktrack", "project-key", params.id],
    `/api/projects/${params.id}`,
    { select: (d) => (d as { projectKey?: string | null } | null)?.projectKey ?? null },
  );
  useEffect(() => {
    if (!projectKey || !pathname) return;
    // params.id is the raw URL segment; if it isn't already the key, swap it.
    // IMPORTANT: use history.replaceState, NOT router.replace. router.replace
    // triggers a real Next navigation that remounts the route subtree — which
    // made deep-linked panels (e.g. /test/runs?createRun=1) flash closed then
    // reopen and caused visible flicker. replaceState only rewrites the address
    // bar (cosmetic), leaving the mounted tree untouched. Routes accept both the
    // id and the key, so the already-rendered page keeps working unchanged.
    if (params.id !== projectKey && typeof window !== "undefined") {
      const rest = pathname.split("/").slice(3).join("/"); // segment after /spaces/<id>
      const qs = window.location.search;
      const next = `/spaces/${projectKey}${rest ? `/${rest}` : ""}${qs}`;
      window.history.replaceState(window.history.state, "", next);
    }
  }, [projectKey, params.id, pathname]);

  // Tabs valid for this project's template — a discovery-only tab (Ideas) is not
  // a real destination on a non-discovery space even via direct URL.
  const templateAllows = (path: string) =>
    selectableTabs(templateKey).some((t) => t.path === path);

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
  const tabDisabled =
    isTab && configLoaded && (!isTabEnabled(tabConfig ?? null, segment) || !templateAllows(segment));

  // First tab that is BOTH enabled by the project AND permitted for this role —
  // the safe redirect target (avoids bouncing to a tab that's itself blocked,
  // which would loop).
  const fallbackPath = useMemo(() => {
    if (perms.loading || !configLoaded) return "summary";
    const allowed = new Set(selectableTabs(templateKey).map((t) => t.path));
    const visible = enabledTabPaths(tabConfig ?? null).filter((p) => {
      if (!allowed.has(p)) return false;
      const g = TAB_ROUTE_GATES[p];
      return !g || perms.has(g.resource, g.action);
    });
    return visible[0] ?? "summary";
  }, [perms, configLoaded, tabConfig, templateKey]);

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

  // Space deleted or no longer accessible (e.g. deleted in another tab, then
  // reached here via the browser Back button). Show a clear message instead of
  // leaving each tab's shimmer / a blank settings form spinning forever. Takes
  // precedence over the tab/permission gates below — the project itself is gone.
  if (projectMissing) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-16">
        <div className="max-w-sm text-center">
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Space not found
          </h1>
          <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
            The space might have been deleted or you don&apos;t have permission.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/dashboard")}
            className="mt-5 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Go to your work
          </button>
        </div>
      </div>
    );
  }

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
    return (
      <div className="h-full bg-white overflow-y-auto overscroll-contain">
        {children}
      </div>
    );
  }

  // Scroll model for every project tab (Summary, Timeline, Backlog, Epics,
  // Board, Grouped Kanban, List, Task Table, …):
  //
  //   • the column is pinned to the slot height (`h-full min-h-0`) and clips
  //     (`overflow-hidden`), so a tab can never make the shell taller than the
  //     viewport — the project header and tab bar stay put;
  //   • ONE scroll container underneath it holds the tab body;
  //   • `overscroll-contain` stops the wheel from chaining outwards when that
  //     container hits its end.
  //
  // Without the containment, reaching the last row of a long tab (Grouped
  // Kanban was the worst case at 138 rows) handed the remaining wheel delta to
  // the outer container, which scrolled the header/sidebar away and left you
  // staring at blank page background. Scrolling now simply stops on the last
  // row, and the scroll height always tracks the content.
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-shrink-0 bg-white">
        <ProjectHeader projectId={params.id} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-white min-w-0">
        {children}
      </div>
    </div>
  );
}
