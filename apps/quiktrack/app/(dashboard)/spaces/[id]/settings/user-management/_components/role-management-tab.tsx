"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Shield, ShieldCheck, Trash2 } from "lucide-react";
import { ProjectPermissionMatrix } from "./permission-matrix";
import { AddRoleModal } from "./add-role-modal";
import { FieldPermissionMatrix } from "@/app/(dashboard)/settings/user-management/_components/field-permission-matrix";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { SPACE_ADMIN_ROLE_NAME, PROTECTED_PROJECT_ROLE_NAMES } from "@/lib/api/permissionsRegistry";
import { confirmDialog } from "@/lib/ui/confirm";

interface ProjectRole {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  _count?: { permissions: number; navigations: number; members: number };
}

export function ProjectRoleManagementTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<"fields" | "entities">("fields");
  const [addOpen, setAddOpen] = useState(false);
  const projectPerms = useMyProjectPermissions(projectId);
  // Only app-wide admins (tenant admin / super admin) can edit project roles.
  // Project-level "ProjectMember:update" no longer unlocks role editing —
  // it remains scoped to assigning members.
  const canManageRoles = projectPerms.isAdmin;

  const rolesQ = useQuery({
    queryKey: ["quiktrack", "project-roles", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/roles`);
      const j = await r.json();
      return (j.data as ProjectRole[]) ?? [];
    },
  });

  const projectQ = useQuery({
    queryKey: ["quiktrack", "project-name", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}`);
      const j = await r.json();
      return (j.data?.name as string | undefined) ?? null;
    },
  });

  const roles = rolesQ.data ?? [];
  const projectName = projectQ.data ?? "this project";

  useEffect(() => {
    if (!selectedRoleId && roles.length > 0) setSelectedRoleId(roles[0].id);
  }, [roles, selectedRoleId]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/projects/${projectId}/roles/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "project-roles", projectId] });
      setSelectedRoleId(null);
    },
  });

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  return (
    <div className="flex h-full">
      <aside className="w-72 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200">
          <div className="text-[10px] font-semibold tracking-wider uppercase text-emerald-700">
            Project-scoped
          </div>
          <div className="text-xs text-emerald-900 truncate" title={projectName}>
            {projectName}
          </div>
        </div>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Roles in this project</h2>
          {canManageRoles && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center"
              aria-label="Add role"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {rolesQ.isLoading ? (
            <p className="px-4 py-3 text-sm text-gray-500">Loading…</p>
          ) : roles.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">No roles yet.</p>
          ) : roles.map((r) => {
            const active = r.id === selectedRoleId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoleId(r.id)}
                className={`group w-full px-4 py-2 text-left flex items-center justify-between gap-2 text-sm ${
                  active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <Shield className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="truncate">{r.name}</span>
                  {r.isDefault && (
                    <span className="text-[9px] uppercase tracking-wider bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      Default
                    </span>
                  )}
                </span>
                {/* Seeded roles (Space Admin / Contributor / Viewer) and the
                    default role are structural — hide their trash (the server
                    rejects deletion too). Custom roles stay deletable. */}
                {canManageRoles &&
                  !PROTECTED_PROJECT_ROLE_NAMES.includes(r.name) &&
                  !r.isDefault && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await confirmDialog({
                        title: "Delete role",
                        message: `Delete role "${r.name}"?`,
                        confirmText: "Delete",
                        danger: true,
                      });
                      if (ok) del.mutate(r.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex-1 min-w-0 bg-gray-50 overflow-y-auto">
        {selectedRole ? (
          <div className="px-8 py-6 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-gray-900">
                Permissions — {selectedRole.name}
              </h3>
              <Shield className="h-4 w-4 text-emerald-500" />
              <span className="text-[10px] font-semibold tracking-wider uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                Project-scoped
              </span>
              <span className="text-xs text-gray-500">· {projectName}</span>
            </div>

            {selectedRole.name === SPACE_ADMIN_ROLE_NAME ? (
              <div className="flex flex-col items-center justify-center text-center rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50 to-white px-8 py-12 dark:border-emerald-400/20 dark:from-emerald-500/10 dark:to-gray-950">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                  <ShieldCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h4 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Full access within this project
                </h4>
                <p className="mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
                  The <span className="font-medium text-gray-800 dark:text-gray-200">Space Admin</span> role has full
                  control of <span className="font-medium text-gray-800 dark:text-gray-200">{projectName}</span> — every
                  field and entity, just like an app admin but scoped to this project. There&apos;s
                  nothing to configure here; its permissions can&apos;t be restricted.
                </p>
              </div>
            ) : (
            <>
            <nav className="flex gap-6 border-b border-gray-200">
              {(
                [
                  { k: "fields" as const, label: "Fields" },
                  { k: "entities" as const, label: "Entities" },
                ]
              ).map(({ k, label }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSubTab(k)}
                  className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
                    subTab === k
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className="bg-gray-900 text-white rounded-md px-4 py-2.5 flex items-start gap-2 text-xs">
              <span className="font-semibold">ⓘ</span>
              <span>
                Project roles apply only inside <span className="font-semibold">this project</span>, and
                they <span className="font-semibold">override</span> a user&apos;s app-wide role here — what you
                set below is exactly what members holding this role can do in this project (app admins always
                have full access).
              </span>
            </div>

            {!canManageRoles && !projectPerms.loading && (
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
                <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                <span>
                  <span className="font-semibold">Read-only.</span> Only app admins can edit
                  project roles. Ask a tenant admin if you need changes here.
                </span>
              </div>
            )}

            <fieldset disabled={!canManageRoles} className="contents">
              {subTab === "fields" ? (
                <FieldPermissionMatrix
                  roleId={selectedRole.id}
                  endpoint={`/api/projects/${projectId}/roles/${selectedRole.id}/field-permissions`}
                  queryKey={["quiktrack", "project-role-field-perms", projectId, selectedRole.id]}
                />
              ) : (
                <ProjectPermissionMatrix projectId={projectId} roleId={selectedRole.id} />
              )}
            </fieldset>
            </>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            Select a role to view its permissions.
          </div>
        )}
      </section>

      {addOpen && <AddRoleModal projectId={projectId} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
