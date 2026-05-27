"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ProjectHeader } from "./_components/project-header";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";

/**
 * Per-route entity-permission requirements inside `/spaces/[id]/<sub>`.
 * Keys are the URL segment after the project id; values are the entity
 * perm the user must hold (Layer 1 ∪ Layer 2) to view that sub-route.
 *
 * Kept in sync with the TABS array in project-header.tsx — if a tab is
 * hidden because the user lacks the perm, the route is also blocked so
 * a direct URL visit doesn't bypass the gate.
 */
const ROUTE_GATES: Record<string, { resource: string; action: string }> = {
  summary: { resource: "ProjectSummary", action: "view" },
  timeline: { resource: "ProjectTimeline", action: "view" },
  backlog: { resource: "ProjectBacklog", action: "view" },
  list: { resource: "ProjectList", action: "view" },
  "task-table": { resource: "ProjectTaskTable", action: "view" },
  board: { resource: "Board", action: "view" },
  "grouped-kanban": { resource: "Board", action: "view" },
  timesheet: { resource: "Timesheet", action: "view" },
  docs: { resource: "Doc", action: "view" },
};

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

  const isSettings = pathname?.startsWith(`/spaces/${params.id}/settings`) ?? false;
  // Full-page issue view (/spaces/<id>/work/<issueId>) renders its own
  // breadcrumb, so the project tab bar is suppressed to match the Jira
  // single-issue layout.
  const isWorkItem = pathname?.startsWith(`/spaces/${params.id}/work/`) ?? false;

  // Resolve the sub-route segment (e.g. "timesheet" in /spaces/abc/timesheet)
  // and bounce the user to the project landing page if their role doesn't
  // grant the required entity perm. Settings and work-item views are
  // exempt — settings has its own admin-only gate; work-item is shared
  // chrome that any project member should see.
  const segment = pathname?.split("/")[3] ?? "";
  const gate = ROUTE_GATES[segment];

  useEffect(() => {
    if (isSettings || isWorkItem) return;
    if (!gate || perms.loading) return;
    if (!perms.has(gate.resource, gate.action)) {
      router.replace(`/spaces/${params.id}/summary`);
    }
  }, [gate, perms, perms.loading, isSettings, isWorkItem, router, params.id]);

  // While we're verifying, render nothing for the gated sub-route — avoids
  // a flash of forbidden content before the redirect fires.
  if (!isSettings && !isWorkItem && gate && !perms.loading && !perms.has(gate.resource, gate.action)) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500">
        You don&apos;t have access to this view.
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
      <div className="flex-1 overflow-y-auto bg-white">{children}</div>
    </div>
  );
}
