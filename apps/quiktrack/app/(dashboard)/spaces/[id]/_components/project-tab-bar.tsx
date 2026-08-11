"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { useApiData } from "@/lib/hooks/useApiData";
import { PROJECT_TABS, enabledTabPaths, selectableTabs } from "@/lib/projectTabs";
import { showToast } from "@/lib/ui/toast";
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

  // Drag-to-reorder (Space Admins only). We reorder the VISIBLE tab paths, then
  // splice that new order back into the full enabled list (so hidden-but-enabled
  // tabs keep their relative spots) and PATCH the whole ordered tabConfig — the
  // same contract the customizer uses. `dragPath` tracks the tab being dragged
  // (for the drop-target styling); `savingOrder` guards concurrent writes.
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [overPath, setOverPath] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  async function persistOrder(newVisibleOrder: string[]) {
    // Rebuild the full enabled list: keep every currently-enabled path, but with
    // the visible ones re-sequenced into `newVisibleOrder`. Non-visible enabled
    // paths stay at their original index.
    const fullEnabled = enabledTabPaths(tabConfig ?? null);
    const visibleSet = new Set(newVisibleOrder);
    let vi = 0;
    const merged = fullEnabled.map((p) =>
      visibleSet.has(p) ? newVisibleOrder[vi++] : p,
    );
    setSavingOrder(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabConfig: merged }),
      }).then((r) => r.json());
      if (!res?.success) {
        showToast(res?.error ?? "Failed to reorder tabs", "error");
        return;
      }
      await refetchTabs();
    } catch {
      showToast("Failed to reorder tabs", "error");
    } finally {
      setSavingOrder(false);
    }
  }

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
          const isDragTarget = overPath === t.path && dragPath !== null && dragPath !== t.path;
          function reorderTo(targetPath: string) {
            const order = visibleTabs.map((v) => v.path);
            const from = order.indexOf(dragPath ?? "");
            const to = order.indexOf(targetPath);
            if (from === -1 || to === -1 || from === to) return;
            const next = [...order];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            void persistOrder(next);
          }
          return (
            <Link
              key={t.path}
              href={`/spaces/${projectId}/${t.path}`}
              // Space Admins can drag a tab to reorder; regular users just click.
              draggable={canCustomizeTabs && !savingOrder}
              onDragStart={
                canCustomizeTabs
                  ? (e) => {
                      setDragPath(t.path);
                      e.dataTransfer.effectAllowed = "move";
                    }
                  : undefined
              }
              onDragOver={
                canCustomizeTabs
                  ? (e) => {
                      if (!dragPath) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setOverPath(t.path);
                    }
                  : undefined
              }
              onDrop={
                canCustomizeTabs
                  ? (e) => {
                      e.preventDefault();
                      reorderTo(t.path);
                      setDragPath(null);
                      setOverPath(null);
                    }
                  : undefined
              }
              onDragEnd={
                canCustomizeTabs
                  ? () => {
                      setDragPath(null);
                      setOverPath(null);
                    }
                  : undefined
              }
              className={`inline-flex items-center gap-1.5 px-3 h-9 text-sm whitespace-nowrap border-b-2 ${
                isActive
                  ? "border-blue-600 text-blue-700 font-medium"
                  : "border-transparent text-gray-700 hover:text-gray-900"
              } ${canCustomizeTabs ? "cursor-grab active:cursor-grabbing" : ""} ${
                dragPath === t.path ? "opacity-40" : ""
              } ${isDragTarget ? "bg-blue-50 rounded-t" : ""}`}
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
