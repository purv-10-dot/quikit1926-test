"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Info, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { SpaceIcon, PROJECT_ICONS } from "@/components/space-icon";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface Project {
  id: string;
  name: string;
  projectKey: string;
  projectType: string;
  icon: string | null;
  color: string | null;
  leadUserId: string | null;
  status: string;
  isAdmin?: boolean;
  canArchive?: boolean;
}

type LifecycleAction = "archive" | "unarchive" | "trash";

const LIFECYCLE: Record<
  LifecycleAction,
  { title: string; message: string; confirmLabel: string; tone: "default" | "danger" }
> = {
  archive: {
    title: "Archive project?",
    message:
      "It'll be hidden from the projects list. You can unarchive it anytime from the Archived tab — nothing is deleted.",
    confirmLabel: "Archive",
    tone: "default",
  },
  unarchive: {
    title: "Unarchive project?",
    message: "It'll return to the active projects list.",
    confirmLabel: "Unarchive",
    tone: "default",
  },
  trash: {
    title: "Move to trash?",
    message:
      "The project will be removed from the list and permanently deleted after 60 days. An admin can restore it from Trash anytime before then.",
    confirmLabel: "Move to trash",
    tone: "danger",
  },
};

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
  const router = useRouter();
  const [lifecycle, setLifecycle] = useState<LifecycleAction | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

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

  async function runLifecycle() {
    if (!project || !lifecycle) return;
    setLifecycleBusy(true);
    try {
      const res =
        lifecycle === "trash"
          ? await fetch(`/api/projects/${projectId}`, { method: "DELETE" })
          : await fetch(`/api/projects/${projectId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: lifecycle === "archive" ? "archived" : "active" }),
            });
      if (!res.ok) return;
      if (lifecycle === "trash") {
        // Project is gone from this org's active set — the settings page is no
        // longer reachable, so send the user back to the list.
        router.push("/spaces");
        return;
      }
      setProject((p) => (p ? { ...p, status: lifecycle === "archive" ? "archived" : "active" } : p));
      setLifecycle(null);
    } finally {
      setLifecycleBusy(false);
    }
  }

  const lead = leadUserId ? members.find((m) => m.userId === leadUserId) : null;
  // Archive/unarchive: global admins OR this space's Space Admin (canArchive).
  // Move to trash: global admins only (isAdmin).
  const isAdmin = !!project?.isAdmin;
  const canArchive = !!project?.canArchive;
  const isArchived = project?.status === "archived";
  const cfg = lifecycle ? LIFECYCLE[lifecycle] : null;

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

      {isArchived && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <Archive className="h-4 w-4" />
            <span>This project is archived. It&apos;s hidden from the projects list.</span>
          </div>
          {canArchive && (
            <button
              type="button"
              onClick={() => setLifecycle("unarchive")}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-amber-900 border border-amber-300 rounded hover:bg-amber-100"
            >
              <ArchiveRestore className="h-3.5 w-3.5" />
              Unarchive
            </button>
          )}
        </div>
      )}
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

      {/* Danger zone — archive: admins + Space Admin; trash: admins only. */}
      {(canArchive || isAdmin) && (
        <div className="mt-12 border border-red-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-red-200 bg-red-50">
            <h2 className="text-sm font-semibold text-red-800">Danger zone</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {canArchive &&
              (!isArchived ? (
                <DangerRow
                  title="Archive project"
                  description="Hide it from the projects list. Reversible anytime — nothing is deleted."
                  actionLabel="Archive"
                  icon={<Archive className="h-4 w-4" />}
                  onClick={() => setLifecycle("archive")}
                />
              ) : (
                <DangerRow
                  title="Unarchive project"
                  description="Return it to the active projects list."
                  actionLabel="Unarchive"
                  icon={<ArchiveRestore className="h-4 w-4" />}
                  onClick={() => setLifecycle("unarchive")}
                />
              ))}
            {isAdmin && (
              <DangerRow
                title="Move to trash"
                description="Remove the project from the list. Restorable from Trash for 60 days, then permanently deleted."
                actionLabel="Move to trash"
                danger
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setLifecycle("trash")}
              />
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!cfg}
        title={cfg?.title ?? ""}
        message={cfg?.message}
        confirmLabel={cfg?.confirmLabel}
        tone={cfg?.tone}
        loading={lifecycleBusy}
        onConfirm={runLifecycle}
        onCancel={() => !lifecycleBusy && setLifecycle(null)}
      />
    </div>
  );
}

function DangerRow({
  title,
  description,
  actionLabel,
  icon,
  danger,
  onClick,
}: {
  title: string;
  description: string;
  actionLabel: string;
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4">
      <div>
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded border whitespace-nowrap ${
          danger
            ? "border-red-300 text-red-700 hover:bg-red-50"
            : "border-gray-300 text-gray-700 hover:bg-gray-50"
        }`}
      >
        {icon}
        {actionLabel}
      </button>
    </div>
  );
}
