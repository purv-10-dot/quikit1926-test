"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, ChevronDown } from "lucide-react";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { SpaceIcon } from "@/components/space-icon";

interface Project {
  id: string;
  name: string;
  projectType?: string;
  icon?: string | null;
  color?: string | null;
}

const NAV: {
  key: string;
  label: string;
  href: (id: string) => string;
  tag?: string;
  /** Required project perm (Layer 1 ∪ Layer 2) — entry hidden otherwise. */
  perm?: { resource: string; action: string };
}[] = [
  { key: "details", label: "Details", href: (id) => `/spaces/${id}/settings` },
  { key: "user-management", label: "Roles & Permissions", href: (id) => `/spaces/${id}/settings/user-management`, perm: { resource: "ProjectMember", action: "view" } },
  { key: "fields", label: "Fields", href: (id) => `/spaces/${id}/settings/fields`, perm: { resource: "ProjectMember", action: "update" } },
  // TODO: the following nav entries are coming soon — their pages are stubs.
  // Restore once their corresponding settings UIs are implemented.
  // { key: "access", label: "Access", href: (id) => `/spaces/${id}/settings/access` },
  // { key: "types", label: "Types and workflows", href: (id) => `/spaces/${id}/settings/types` },
  // { key: "hierarchies", label: "Hierarchies", href: (id) => `/spaces/${id}/settings/hierarchies`, tag: "TRY" },
  // { key: "notifications", label: "Notifications", href: (id) => `/spaces/${id}/settings/notifications` },
  // { key: "features", label: "Features", href: (id) => `/spaces/${id}/settings/features` },
  // { key: "automation", label: "Automation", href: (id) => `/spaces/${id}/settings/automation` },
  // { key: "slack", label: "Slack integration", href: (id) => `/spaces/${id}/settings/slack` },
];

function projectTypeLabel(t?: string) {
  if (t === "discovery") return "Product discovery space";
  if (t === "service") return "Service management space";
  return "Software space";
}

export function SettingsShell({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const perms = useMyProjectPermissions(projectId);
  const [project, setProject] = useState<Project | null>(null);
  const [featuresOpen, setFeaturesOpen] = useState(false);

  // Hide nav entries the current user can't act on. Pages re-enforce with
  // RequireProjectPerm so direct URL hits are also blocked.
  const visibleNav = NAV.filter(
    (n) => !n.perm || perms.loading || perms.has(n.perm.resource, n.perm.action),
  );

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

  const isActive = (href: string) =>
    href === `/spaces/${projectId}/settings`
      ? pathname === href
      : pathname.startsWith(href);

  return (
    <div className="flex h-full bg-white">
      {/* Inner sidebar */}
      <aside className="w-[240px] shrink-0 border-r border-gray-200 px-3 py-4 overflow-y-auto">
        <button
          type="button"
          onClick={() => router.push(`/spaces/${projectId}/backlog`)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Project settings
        </button>
        <div className="mt-5 flex items-center gap-2 px-2">
          <SpaceIcon icon={project?.icon} name={project?.name} color={project?.color} size={32} radius={8} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">
              {project?.name ?? "—"}
            </div>
            <div className="text-[11px] text-gray-500 truncate">
              {projectTypeLabel(project?.projectType)}
            </div>
          </div>
        </div>

        <nav className="mt-4 space-y-0.5">
          {visibleNav.map((n) => {
            const href = n.href(projectId);
            const active = isActive(href);
            const isFeatures = n.key === "features";
            return (
              <div key={n.key}>
                {isFeatures ? (
                  <button
                    type="button"
                    onClick={() => setFeaturesOpen((v) => !v)}
                    className={`w-full flex items-center gap-1.5 px-3 h-8 text-sm rounded ${
                      active
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {featuresOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <span className="flex-1 text-left truncate">{n.label}</span>
                  </button>
                ) : (
                  <Link
                    href={href}
                    className={`flex items-center gap-2 px-3 h-8 text-sm rounded ${
                      active
                        ? "bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600 -ml-px pl-[10px]"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span className="flex-1 truncate">{n.label}</span>
                    {n.tag && (
                      <span className="text-[10px] font-semibold text-pink-600 border border-pink-300 rounded px-1 py-0.5 leading-none">
                        {n.tag}
                      </span>
                    )}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-white">{children}</main>
    </div>
  );
}
