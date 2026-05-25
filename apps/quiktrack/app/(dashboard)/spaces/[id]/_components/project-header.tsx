"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { recordActivity } from "@/lib/utils/history";
import { AddPeopleModal } from "@/components/add-people-modal";
import { ShareFeedbackModal } from "@/components/share-feedback-modal";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import {
  UserPlus,
  MoreHorizontal,
  Share2,
  Zap,
  Link as LinkIcon,
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
} from "lucide-react";

/**
 * Tab list with the entity permission that gates each one. `perm: null` means
 * "always show" (Summary / Timeline / Docs are intrinsic project chrome with
 * no enforceable entity behind them today).
 */
const TABS: Array<{
  label: string;
  path: string;
  icon: typeof Globe;
  perm: { resource: string; action: string } | null;
}> = [
  { label: "Summary", path: "summary", icon: Globe, perm: { resource: "ProjectSummary", action: "view" } },
  { label: "Timeline", path: "timeline", icon: CalendarIcon, perm: { resource: "ProjectTimeline", action: "view" } },
  { label: "Backlog", path: "backlog", icon: ListIcon, perm: { resource: "ProjectBacklog", action: "view" } },
  { label: "Board", path: "board", icon: Columns, perm: { resource: "Board", action: "view" } },
  { label: "List", path: "list", icon: ListChecks, perm: { resource: "ProjectList", action: "view" } },
  { label: "Task Table", path: "task-table", icon: ListTree, perm: { resource: "ProjectTaskTable", action: "view" } },
  { label: "Timesheet", path: "timesheet", icon: Clock, perm: { resource: "Timesheet", action: "view" } },
  { label: "Docs", path: "docs", icon: FileText, perm: { resource: "Doc", action: "view" } },
];

interface Project {
  id: string;
  name: string;
  projectKey: string;
  icon?: string | null;
  color?: string | null;
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

  const activeTab = TABS.find((t) => pathname.endsWith(`/${t.path}`))?.path ?? "board";

  useEffect(() => {
    if (!project || !pathname) return;
    const tabLabel = TABS.find((t) => t.path === activeTab)?.label ?? "Board";
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
      href: `/spaces/${project.id}/board`,
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
              Spaces
            </Link>
            <span className="text-gray-300">/</span>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!project ? (
              <span className="h-7 w-7 rounded bg-gray-200 animate-pulse" />
            ) : project.icon ? (
              <span className="h-7 w-7 rounded flex items-center justify-center text-xl leading-none bg-gray-50">
                {project.icon}
              </span>
            ) : (
              <span
                className="h-7 w-7 rounded flex items-center justify-center text-white text-sm font-semibold"
                style={{ background: project.color ?? "#2563eb" }}
              >
                {project.name?.charAt(0).toUpperCase() || "?"}
              </span>
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
            <button
              className="p-1 rounded border border-gray-200 hover:bg-gray-100"
              aria-label="More"
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-gray-600" />
            </button>
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

      <div className="px-6 flex items-center gap-1 overflow-x-auto">
        {TABS.filter(
          (t) => !t.perm || perms.loading || perms.has(t.perm.resource, t.perm.action),
        ).map((t) => {
          const isActive = activeTab === t.path;
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
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </Link>
          );
        })}
        <button className="ml-1 p-1.5 rounded hover:bg-gray-100 text-gray-500" aria-label="Add tab">
          <Plus className="h-4 w-4" />
        </button>
      </div>

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
