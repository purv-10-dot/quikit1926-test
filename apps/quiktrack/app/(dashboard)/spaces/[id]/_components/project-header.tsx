"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { recordActivity } from "@/lib/utils/history";
import { AddPeopleModal } from "@/components/add-people-modal";
import { ShareFeedbackModal } from "@/components/share-feedback-modal";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { SpaceIcon } from "@/components/space-icon";
import {
  UserPlus,
  Share2,
  Zap,
  Link as LinkIcon,
  Settings as SettingsIcon,
  Maximize2,
  Minimize2,
  Globe,
  Calendar as CalendarIcon,
  List as ListIcon,
  ListChecks,
  Code,
  Archive,
  FileText,
  ArrowRight,
  ListTree,
  Columns,

  ClipboardList,
  Plus,
  Clock,
  LayoutGrid,
} from "lucide-react";
import { PROJECT_TABS } from "@/lib/projectTabs";
import { ProjectTabBar } from "./project-tab-bar";

interface Project {
  id: string;
  name: string;
  projectKey: string;
  icon?: string | null;
  color?: string | null;
  templateKey?: string | null;
}

export function ProjectHeader({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const perms = useMyProjectPermissions(projectId);
  const canAddMember = perms.loading || perms.has("ProjectMember", "create");
  const [project, setProject] = useState<Project | null>(null);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const autoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoOpen) return;
    function onDoc(e: MouseEvent) {
      if (autoRef.current && !autoRef.current.contains(e.target as Node)) setAutoOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [autoOpen]);

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
  }, [projectId]);

  const activeTab = PROJECT_TABS.find((t) => pathname.endsWith(`/${t.path}`))?.path ?? "board";

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
      href: `/spaces/${project.id}/backlog`,
      icon: project.icon ?? null,
      color: project.color ?? null,
    });
  }, [project, pathname, activeTab]);

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="px-6 pt-3 pb-2">
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
          </div>
          <div className="flex items-center gap-1.5">
            {/* TODO: Share + Automation — coming soon
            <button className="p-1.5 rounded border border-gray-200 hover:bg-gray-100" aria-label="Share">
              <Share2 className="h-3.5 w-3.5 text-gray-600" />
            </button>
            <div ref={autoRef} className="relative">
              <button
                type="button"
                onClick={() => setAutoOpen((v) => !v)}
                className={`p-1.5 rounded border ${autoOpen ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:bg-gray-100"}`}
                aria-label="Automation"
              >
                <Zap className={`h-3.5 w-3.5 ${autoOpen ? "text-blue-600" : "text-gray-600"}`} />
              </button>
              {autoOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-md shadow-xl z-30 p-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center h-9 w-9 rounded bg-blue-50 text-blue-600 shrink-0">
                      <Zap className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Automation</h3>
                      <p className="mt-1 text-xs text-gray-600 leading-snug">
                        Coming soon — automate manual tasks so your team can focus on what matters.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            */}
            <Link
              href={`/spaces/${projectId}/settings`}
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
