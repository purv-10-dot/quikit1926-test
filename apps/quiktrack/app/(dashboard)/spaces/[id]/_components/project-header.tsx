"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { recordActivity } from "@/lib/utils/history";
import { AddPeopleModal } from "@/components/add-people-modal";
import {
  UserPlus,
  MoreHorizontal,
  Share2,
  Zap,
  Link as LinkIcon,
  Maximize2,
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

const TABS = [
  { label: "Summary", path: "summary", icon: Globe },
  { label: "Timeline", path: "timeline", icon: CalendarIcon },
  { label: "Backlog", path: "backlog", icon: ListIcon },
  { label: "Board", path: "board", icon: Columns },
  // { label: "Calendar", path: "calendar", icon: CalendarIcon },
  { label: "List", path: "list", icon: ListChecks },
  { label: "Task Table", path: "task-table", icon: ListTree },
  { label: "Timesheet", path: "timesheet", icon: Clock },
  // { label: "Forms", path: "forms", icon: ClipboardList },
  // { label: "Development", path: "development", icon: ListTree },
  // { label: "Code", path: "code", icon: Code },
  // { label: "Archived work items", path: "archived", icon: Archive },
  { label: "Docs", path: "docs", icon: FileText },
  // { label: "Shortcuts", path: "shortcuts", icon: ArrowRight },
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
  const [project, setProject] = useState<Project | null>(null);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);

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
            <button
              type="button"
              onClick={() => setAddPeopleOpen(true)}
              className="p-1 rounded border border-gray-200 hover:bg-gray-100"
              aria-label="Add member"
            >
              <UserPlus className="h-3.5 w-3.5 text-gray-600" />
            </button>
            <button
              className="p-1 rounded border border-gray-200 hover:bg-gray-100"
              aria-label="More"
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-gray-600" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="p-1.5 rounded border border-gray-200 hover:bg-gray-100" aria-label="Share">
              <Share2 className="h-3.5 w-3.5 text-gray-600" />
            </button>
            <button className="p-1.5 rounded border border-gray-200 hover:bg-gray-100" aria-label="Automation">
              <Zap className="h-3.5 w-3.5 text-gray-600" />
            </button>
            <button className="p-1.5 rounded border border-gray-200 hover:bg-gray-100" aria-label="Link">
              <LinkIcon className="h-3.5 w-3.5 text-gray-600" />
            </button>
            <button className="p-1.5 rounded border border-gray-200 hover:bg-gray-100" aria-label="Fullscreen">
              <Maximize2 className="h-3.5 w-3.5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 flex items-center gap-1 overflow-x-auto">
        {TABS.map((t) => {
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
          projectName={project.name}
          onClose={() => setAddPeopleOpen(false)}
        />
      )}
    </div>
  );
}
