"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Filter, ChevronDown } from "lucide-react";
import { SkeletonList } from "@/components/skeleton";

const CHART_OPTIONS = [{ key: "issues", label: "Issues" }];

const FILTER_PRESETS: { key: string; label: string; query: string }[] = [
  { key: "all", label: "All issues", query: "" },
  { key: "resolved-recent", label: "Resolved recently", query: "?statusCategory=DONE&updatedSince=7d" },
  { key: "outstanding", label: "Outstanding", query: "?statusCategory=BACKLOG,IN_PROGRESS" },
  { key: "added-recent", label: "Added recently", query: "?createdSince=7d" },
  { key: "unscheduled", label: "Unscheduled", query: "?sprintId=null" },
  { key: "updated-recent", label: "Updated recently", query: "?updatedSince=7d" },
  { key: "assigned-me", label: "Assigned to me", query: "?assigneeId=me" },
  { key: "unresolved", label: "Unresolved", query: "?statusCategory=BACKLOG,IN_PROGRESS" },
  { key: "reported-me", label: "Reported by me", query: "?reporterId=me" },
];

function useOutsideClose<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);
  return ref;
}

interface Project {
  id: string;
  name: string;
  projectKey: string;
  color?: string | null;
  icon?: string | null;
  lead?: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
}

export function ProjectsWidget({ refreshKey = 0 }: { refreshKey?: number }) {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    void fetch("/api/projects?pageSize=8&sort=updatedAt&order=desc")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setProjects(j.data ?? []);
        else setProjects([]);
      })
      .catch(() => setProjects([]));
  }, [refreshKey]);

  if (projects === null) {
    return (
      <div className="p-4">
        <SkeletonList rows={4} withAvatar />
      </div>
    );
  }
  if (projects.length === 0) {
    return <div className="p-5 text-sm text-gray-400 text-center">No projects yet.</div>;
  }
  return (
    <div className="border-t border-gray-100">
      {projects.map((p, idx) => (
        <ProjectRow key={p.id} project={p} striped={idx % 2 === 0} />
      ))}
    </div>
  );
}

function ProjectRow({ project: p, striped }: { project: Project; striped: boolean }) {
  const router = useRouter();
  const [chartOpen, setChartOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const chartRef = useOutsideClose<HTMLDivElement>(chartOpen, () => setChartOpen(false));
  const filterRef = useOutsideClose<HTMLDivElement>(filterOpen, () => setFilterOpen(false));

  return (
    <div
      className={`grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 ${
        striped ? "bg-gray-50/60" : "bg-white"
      } border-b border-gray-100 last:border-b-0`}
    >
      <div className="min-w-0">
        <Link
          href={`/spaces/${p.id}/backlog`}
          className="inline-flex items-center gap-2"
        >
          <span
            className="h-6 w-6 rounded flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
            style={{ background: p.color ?? "#2563eb" }}
          >
            {p.icon ?? p.name.charAt(0).toUpperCase()}
          </span>
          <span className="text-sm text-blue-600 hover:underline truncate font-medium">
            {p.name}
          </span>
          <span className="text-xs text-gray-500">({p.projectKey})</span>
        </Link>
        <div className="mt-0.5 ml-8 text-xs text-gray-700">
          <span className="text-gray-500 mr-3 font-medium">Lead</span>
          <Link href="#" className="text-blue-600 hover:underline">
            {p.lead
              ? `${p.lead.firstName ?? ""} ${p.lead.lastName ?? ""}`.trim() ||
                p.lead.email
              : "—"}
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 text-gray-500">
        <div className="relative" ref={chartRef}>
          <button
            type="button"
            onClick={() => setChartOpen((v) => !v)}
            className={`inline-flex items-center h-6 w-7 px-1 rounded border ${
              chartOpen ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:bg-white"
            }`}
            aria-label="Charts"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
          {chartOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded shadow-lg z-30 py-1">
              {CHART_OPTIONS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setChartOpen(false);
                    router.push(`/spaces/${p.id}/list`);
                  }}
                  className="w-full px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50"
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className={`inline-flex items-center h-6 w-7 px-1 rounded border ${
              filterOpen ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:bg-white"
            }`}
            aria-label="Filter"
          >
            <Filter className="h-3.5 w-3.5" />
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-30 py-1">
              {FILTER_PRESETS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setFilterOpen(false);
                    router.push(`/spaces/${p.id}/list${f.query}`);
                  }}
                  className="w-full px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50"
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
