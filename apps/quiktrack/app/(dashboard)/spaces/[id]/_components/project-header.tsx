"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { recordActivity } from "@/lib/utils/history";
import { AddPeopleModal } from "@/components/add-people-modal";
import { ShareFeedbackModal } from "@/components/share-feedback-modal";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { SpaceIcon } from "@/components/space-icon";
import {
  UserPlus,
  Link as LinkIcon,
  Settings as SettingsIcon,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { PROJECT_TABS } from "@/lib/projectTabs";
import { backgroundCss } from "@/lib/spaceBackgrounds";
import { ProjectTabBar } from "./project-tab-bar";
import { SpaceActionsMenu } from "./space-actions-menu";
import type { SpaceSummary } from "./space-actions-meta";

// The header's Share + Automation buttons were removed as unbuilt placeholders.
// TODO: restore them when those features land — see git history for the markup.

type Project = SpaceSummary;

export function ProjectHeader({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const perms = useMyProjectPermissions(projectId);
  const canAddMember = perms.loading || perms.has("ProjectMember", "create");
  const [project, setProject] = useState<Project | null>(null);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Bumped by the "..." menu after a star / background change so the header
  // re-reads the project instead of showing stale chrome.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  function toggleFullscreen() {
    const next = !fullscreen;
    setFullscreen(next);
    window.dispatchEvent(new CustomEvent("qt:fullscreen", { detail: { on: next } }));
  }

  // Listen back so an Escape key or another component flipping state keeps
  // the icon in sync.
  useEffect(() => {
    function onFs(e: Event) {
      const d = (e as CustomEvent<{ on?: boolean }>).detail;
      if (typeof d?.on === "boolean") setFullscreen(d.on);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && fullscreen) {
        setFullscreen(false);
        window.dispatchEvent(new CustomEvent("qt:fullscreen", { detail: { on: false } }));
      }
    }
    window.addEventListener("qt:fullscreen", onFs as EventListener);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("qt:fullscreen", onFs as EventListener);
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  useEffect(() => {
    if (typeof window !== "undefined" && projectId) {
      window.localStorage.setItem("qt:lastProjectId", projectId);
    }
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.success) setProject(j.data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [projectId, reloadKey]);

  const isDiscovery = project?.templateKey === "discovery";
  const bgCss = backgroundCss(project?.background ?? null);
  // When an idea detail drawer is open it carries its own breadcrumb, so the
  // discovery header hides (matches real JPD — no duplicate header / Feedback).
  const [ideaPanelOpen, setIdeaPanelOpen] = useState(false);
  useEffect(() => {
    function onPanel(e: Event) {
      const d = (e as CustomEvent<{ open?: boolean }>).detail;
      if (typeof d?.open === "boolean") setIdeaPanelOpen(d.open);
    }
    window.addEventListener("qt:idea-panel", onPanel as EventListener);
    return () => window.removeEventListener("qt:idea-panel", onPanel as EventListener);
  }, []);
  const activeTab =
    PROJECT_TABS.find((t) => {
      const marker = `/${t.path}`;
      const i = pathname.indexOf(marker);
      if (i === -1) return false;
      const after = pathname.slice(i + marker.length);
      return after === "" || after.startsWith("/");
    })?.path ?? "board";

  useEffect(() => {
    if (!project || !pathname) return;
    const tabLabel = PROJECT_TABS.find((t) => t.path === activeTab)?.label ?? "Board";
    if (activeTab === "board" || activeTab === "list") {
      recordActivity({
        projectId: project.id,
        kind: activeTab === "board" ? "board" : "list",
        title: `${project.projectKey} ${tabLabel.toLowerCase()}`,
        meta: `${tabLabel} • ${project.name}`,
        href: pathname,
        icon: project.icon ?? null,
        color: project.color ?? null,
      });
    }
    recordActivity({
      projectId: project.id,
      kind: "project",
      title: project.name,
      meta: "Team-managed software",
      href: `/spaces/${project.projectKey}/backlog`,
      icon: project.icon ?? null,
      color: project.color ?? null,
    });
  }, [project, pathname, activeTab]);

  // Discovery projects use the real-JPD chrome: a single slim breadcrumb line
  // ("Spaces / icon name") with a Feedback link, and NO project-name row or tab
  // strip — the "All ideas" toolbar (in the Ideas view) carries the page actions.
  if (isDiscovery && project) {
    // Drawer open → suppress the header entirely (its breadcrumb takes over).
    if (ideaPanelOpen) return null;
    return (
      <div className="bg-white" style={bgCss ? { background: bgCss } : undefined}>
        <div
          className={`flex items-center justify-between px-6 pt-4 pb-1 ${
            bgCss ? "bg-white/75" : ""
          }`}
        >
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Link href="/spaces" className="text-gray-500 hover:underline">
              Spaces
            </Link>
            <span className="text-gray-300">/</span>
            <SpaceIcon icon={project.icon} name={project.name} color={project.color} size={18} radius={4} />
            <span className="font-medium text-gray-900" data-project-name={project.name}>{project.name}</span>
            {/* Beside the space name here too, so the menu is in the same place
                whichever header variant is rendered. */}
            <SpaceActionsMenu projectId={projectId} space={project} onChanged={reload} />
          </div>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <LinkIcon className="h-3.5 w-3.5" /> Feedback
          </button>
        </div>
        {feedbackOpen && (
          <ShareFeedbackModal projectId={projectId} onClose={() => setFeedbackOpen(false)} />
        )}
        {addPeopleOpen && (
          <AddPeopleModal projectId={projectId} projectName={project.name} onClose={() => setAddPeopleOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border-b border-gray-200">
      {/* The space background paints the outer band; the content sits on a
          translucent white scrim in a CHILD element so every existing gray
          text/icon colour stays readable on both pale and dark backgrounds.
          The two must not be the same element — an inline `background` style
          always beats a Tailwind background class, so the scrim would never
          render. */}
      <div style={bgCss ? { background: bgCss } : undefined}>
        <div className={`px-6 pt-3 pb-2 ${bgCss ? "bg-white/75" : ""}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/spaces" className="text-xs text-gray-500 hover:underline">
              Projects
            </Link>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!project ? (
              <span className="h-7 w-7 rounded bg-gray-200 animate-pulse" />
            ) : (
              <SpaceIcon icon={project.icon} name={project.name} color={project.color} size={28} radius={6} />
            )}
            {project ? (
              <h1 className="text-base font-semibold text-gray-900">{project.name}</h1>
            ) : (
              <div className="h-4 w-40 rounded bg-gray-200 animate-pulse" />
            )}
            {canAddMember && (
              <button
                type="button"
                onClick={() => setAddPeopleOpen(true)}
                className="p-1 rounded border border-gray-200 hover:bg-gray-100"
                aria-label="Add member"
              >
                <UserPlus className="h-3.5 w-3.5 text-gray-600" />
              </button>
            )}
            {/* Sits beside the space name (next to Add member), matching Jira —
                these are the actions ON this space, as opposed to the view
                controls (settings / feedback / fullscreen) on the right. */}
            <SpaceActionsMenu projectId={projectId} space={project} onChanged={reload} />
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              href={`/spaces/${project?.projectKey ?? projectId}/settings`}
              className="p-1.5 rounded border border-gray-200 hover:bg-gray-100"
              aria-label="Settings"
              title="Settings"
            >
              <SettingsIcon className="h-3.5 w-3.5 text-gray-600" />
            </Link>
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="p-1.5 rounded border border-gray-200 hover:bg-gray-100"
              aria-label="Share feedback"
              title="Share feedback"
            >
              <LinkIcon className="h-3.5 w-3.5 text-gray-600" />
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded border border-gray-200 hover:bg-gray-100"
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            >
              {fullscreen ? (
                <Minimize2 className="h-3.5 w-3.5 text-gray-600" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5 text-gray-600" />
              )}
            </button>
          </div>
        </div>
        </div>
      </div>

      <ProjectTabBar projectId={projectId} templateKey={project?.templateKey} />

      {addPeopleOpen && project && (
        <AddPeopleModal
          projectId={projectId}
          projectName={project.name}
          onClose={() => setAddPeopleOpen(false)}
        />
      )}
      {feedbackOpen && (
        <ShareFeedbackModal projectId={projectId} onClose={() => setFeedbackOpen(false)} />
      )}
    </div>
  );
}
