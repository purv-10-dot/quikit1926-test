"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { useApiData } from "@/lib/hooks/useApiData";
import { PROJECT_TABS, enabledTabPaths, selectableTabs } from "@/lib/projectTabs";
import { TAB_ICONS } from "./tab-icons";
import { TabCustomizer } from "./tab-customizer";

/**
 * Project tab bar. Renders the tabs that are BOTH enabled by the project
 * (QtProject.tabConfig, in config order) AND permitted for the viewer's role.
 * Space Admins (Project:update) get a "+" to curate which tabs appear; the
 * choice persists via PATCH /api/projects/[id] and is shared (same React Query
 * key) with the space layout's route guard.
 */
export function ProjectTabBar({
  projectId,
  templateKey,
}: {
  projectId: string;
  templateKey?: string | null;
}) {
  const pathname = usePathname();
  const perms = useMyProjectPermissions(projectId);
  const canCustomizeTabs = perms.has("Project", "update");
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const customizeRef = useRef<HTMLDivElement>(null);

  const { data: tabConfig, refetch: refetchTabs } = useApiData<string[] | null>(
    ["quiktrack", "project-tabconfig", projectId],
    `/api/projects/${projectId}`,
    { select: (d) => (d as { tabConfig?: string[] | null } | null)?.tabConfig ?? null },
  );

  useEffect(() => {
    if (!customizeOpen) return;
    function onDoc(e: MouseEvent) {
      if (customizeRef.current && !customizeRef.current.contains(e.target as Node)) {
        setCustomizeOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [customizeOpen]);

  const activeTab =
    PROJECT_TABS.find((t) => pathname?.endsWith(`/${t.path}`))?.path ?? "board";

  // Tabs valid for this project's template (drops discovery-only tabs like
  // "Ideas" on a non-discovery space, even if a stale tabConfig still lists it).
  const allowed = new Set(selectableTabs(templateKey).map((t) => t.path));

  const visibleTabs = enabledTabPaths(tabConfig ?? null)
    .filter((path) => allowed.has(path))
    .map((path) => PROJECT_TABS.find((t) => t.path === path))
    .filter((t): t is (typeof PROJECT_TABS)[number] => Boolean(t))
    .filter((t) => !t.perm || perms.loading || perms.has(t.perm.resource, t.perm.action));

  return (
    // Outer row is NOT a scroll container: only the tabs scroll horizontally.
    // Keeping the "+" customizer outside the overflow box means its popover
    // (absolute, dropping below the bar) isn't clipped — setting overflow-x
    // makes overflow-y compute to auto, which would otherwise hide it.
    <div className="px-6 flex items-center gap-1">
      <div className="flex items-center gap-1 overflow-x-auto min-w-0">
        {visibleTabs.map((t) => {
          const isActive = activeTab === t.path;
          const Icon = TAB_ICONS[t.path];
          return (
            <Link
              key={t.path}
              href={`/spaces/${projectId}/${t.path}`}
              className={`inline-flex items-center gap-1.5 px-3 h-9 text-sm whitespace-nowrap border-b-2 ${
                isActive
                  ? "border-blue-600 text-blue-700 font-medium"
                  : "border-transparent text-gray-700 hover:text-gray-900"
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {/* Functional spaces have no sprints — their board is the
                  "Activity Board". The route stays /board; only the label changes. */}
              {t.path === "board" && templateKey === "functional" ? "Activity Board" : t.label}
            </Link>
          );
        })}
      </div>
      {/* Space Admins curate which tabs appear for this project. */}
      {canCustomizeTabs && (
        <div ref={customizeRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setCustomizeOpen((v) => !v)}
            className={`p-1.5 rounded hover:bg-gray-100 ${
              customizeOpen ? "bg-gray-100 text-blue-600" : "text-gray-500"
            }`}
            aria-label="Customize tabs"
            title="Customize tabs"
          >
            <Plus className="h-4 w-4" />
          </button>
          {customizeOpen && (
            <TabCustomizer
              projectId={projectId}
              templateKey={templateKey}
              tabConfig={tabConfig ?? null}
              onSaved={() => void refetchTabs()}
              onClose={() => setCustomizeOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
