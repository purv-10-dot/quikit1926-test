"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Info } from "lucide-react";
import { SpaceIcon, PROJECT_ICONS } from "@/components/space-icon";

interface Project {
  id: string;
  name: string;
  projectKey: string;
  projectType: string;
  icon: string | null;
  color: string | null;
  leadUserId: string | null;
  status: string;
}

interface Member {
  userId: string;
  user: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
}

function fullName(m: Member): string {
  const u = m.user;
  if (!u) return "Unknown";
  const fn = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return fn || u.email;
}

export function DetailsForm({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [leadUserId, setLeadUserId] = useState<string | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/members`).then((r) => r.json()),
    ]).then(([p, m]) => {
      if (!alive) return;
      if (p?.success) {
        const d: Project = p.data;
        setProject(d);
        setName(d.name);
        setProjectKey(d.projectKey);
        setIcon(d.icon ?? null);
        setLeadUserId(d.leadUserId ?? null);
      }
      if (m?.success) {
        // /api/projects/:id/members returns { data: { members, pendingInvites } }
        const list = Array.isArray(m.data?.members) ? m.data.members : [];
        setMembers(list);
      }
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (iconPickerOpen && iconRef.current && !iconRef.current.contains(e.target as Node)) {
        setIconPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [iconPickerOpen]);

  const dirty = useMemo(() => {
    if (!project) return false;
    return (
      name !== project.name ||
      projectKey.toUpperCase() !== project.projectKey ||
      icon !== project.icon
    );
  }, [project, name, projectKey, icon]);

  async function save() {
    if (!project) return;
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          projectKey: projectKey.toUpperCase(),
          icon: icon ?? undefined,
        }),
      }).then((r) => r.json());
      if (!res.success) {
        setError(res.error || "Failed to save");
        return;
      }
      setProject(res.data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } finally {
      setSubmitting(false);
    }
  }

  const lead = leadUserId ? members.find((m) => m.userId === leadUserId) : null;

  return (
    <div className="px-16 py-8 max-w-[820px] mx-auto">
      <nav className="text-xs text-gray-500 mb-2">
        <Link href="/spaces" className="hover:underline">
          Projects
        </Link>
        <span className="mx-1">/</span>
        <Link href={`/spaces/${projectId}/backlog`} className="hover:underline">
          {project?.name ?? "—"}
        </Link>
        <span className="mx-1">/</span>
        Project settings
      </nav>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Details</h1>
        {/* <button className="p-1.5 rounded hover:bg-gray-100 text-gray-600" aria-label="More">
          <MoreHorizontal className="h-4 w-4" />
        </button> */}
      </div>

      <div className="flex flex-col items-center gap-3 mb-6">
        <div className="relative flex flex-col items-center" ref={iconRef}>
          <SpaceIcon icon={icon} name={name} size={128} radius={16} />
          <button
            type="button"
            onClick={() => setIconPickerOpen((v) => !v)}
            className="mt-3 inline-flex items-center h-8 px-3 text-xs font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            Change icon
          </button>
          {iconPickerOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-[300px] bg-white border border-gray-200 rounded-md shadow-lg z-30 p-2 grid grid-cols-6 gap-1.5 max-h-60 overflow-y-auto">
              {PROJECT_ICONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  title={opt.label}
                  onClick={() => {
                    setIcon(opt.key);
                    setIconPickerOpen(false);
                  }}
                  className={`h-11 w-11 rounded-lg flex items-center justify-center hover:bg-gray-100 ${
                    icon === opt.key ? "ring-2 ring-blue-500" : ""
                  }`}
                >
                  <SpaceIcon icon={opt.key} size={34} radius={9} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Required fields are marked with an asterisk <span className="text-red-500">*</span>
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1">
            Project key
            <Info className="h-3 w-3 text-gray-400" />
            <span className="text-red-500">*</span>
          </label>
          <input
            value={projectKey}
            readOnly
            disabled
            aria-readonly="true"
            className="w-full h-9 px-3 text-sm border border-gray-200 rounded uppercase bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-gray-500">
            The project key can&apos;t be changed — it&apos;s used in every work-item ID (e.g. {projectKey || "KEY"}-123).
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Project owner</label>
          <div className="w-full h-9 px-3 flex items-center text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded">
            {lead ? fullName(lead) : "—"}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            Make sure your project lead has access to work items in the project.
          </p>
        </div>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Saved.
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || submitting}
            className="h-9 px-5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:bg-gray-200 disabled:text-gray-500"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
