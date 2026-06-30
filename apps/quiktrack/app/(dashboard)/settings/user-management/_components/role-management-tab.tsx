"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Shield, ShieldCheck, Trash2 } from "lucide-react";
import { PermissionMatrix } from "./permission-matrix";
import { FieldPermissionMatrix } from "./field-permission-matrix";
import { AddRoleModal } from "./add-role-modal";
import { roleDisplayName } from "./role-name";
import { confirmDialog } from "@/lib/ui/confirm";
import { SPACE_CREATOR_ROLE_NAME } from "@/lib/api/permissionsRegistry";

interface AppRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  _count?: { permissions: number; navigations: number; members: number };
}

export function RoleManagementTab() {
  const qc = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<"fields" | "entities">("fields");
  const [addOpen, setAddOpen] = useState(false);

  const rolesQ = useQuery({
    queryKey: ["quiktrack", "org-roles"],
    queryFn: async () => {
      const r = await fetch("/api/org/roles");
      const j = await r.json();
      return (j.data as AppRole[]) ?? [];
    },
  });

  const roles = rolesQ.data ?? [];

  useEffect(() => {
    if (!selectedRoleId && roles.length > 0) setSelectedRoleId(roles[0].id);
  }, [roles, selectedRoleId]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/org/roles/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiktrack", "org-roles"] });
      setSelectedRoleId(null);
    },
  });

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  return (
    <div className="flex h-full">
      <aside className="w-72 border-r border-gray-200 bg-white flex flex-col dark:border-gray-700 dark:bg-gray-900">
        <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-400/20">
          <div className="text-[10px] font-semibold tracking-wider uppercase text-indigo-700 dark:text-indigo-300">
            App-wide
          </div>
          <div className="text-xs text-indigo-900 dark:text-indigo-200/80">
            Applies across every project
          </div>
        </div>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">App-wide roles</h2>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center"
            aria-label="Add role"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {rolesQ.isLoading ? (
            <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Loading…</p>
          ) : roles.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No roles yet.</p>
          ) : roles.map((r) => {
            const active = r.id === selectedRoleId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoleId(r.id)}
                className={`group w-full px-4 py-2 text-left flex items-center justify-between gap-2 text-sm ${
                  active
                    ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-500/15 dark:text-blue-300"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/60"
                }`}
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <Shield className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0 dark:text-indigo-300" />
                  <span className="truncate">{roleDisplayName(r.name)}</span>
                  {r.isDefault && (
                    <span className="text-[9px] uppercase tracking-wider bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded dark:bg-gray-700 dark:text-gray-300">
                      Default
                    </span>
                  )}
                </span>
                {!r.isSystem && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await confirmDialog({
                        title: "Delete role",
                        message: `Delete role "${roleDisplayName(r.name)}"?`,
                        confirmText: "Delete",
                        danger: true,
                      });
                      if (ok) del.mutate(r.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex-1 min-w-0 bg-gray-50 overflow-y-auto dark:bg-gray-950">
        {selectedRole ? (
          <div className="px-8 py-6 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Permissions — {roleDisplayName(selectedRole.name)}
              </h3>
              <Shield className="h-4 w-4 text-indigo-500 dark:text-indigo-300" />
              <span className="text-[10px] font-semibold tracking-wider uppercase bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-1 dark:ring-indigo-400/30">
                App-wide
              </span>
            </div>

            {selectedRole.isSystem && selectedRole.name === "admin" ? (
              <div className="flex flex-col items-center justify-center text-center rounded-xl border border-indigo-100 bg-gradient-to-b from-indigo-50 to-white px-8 py-12 dark:border-indigo-400/20 dark:from-indigo-500/10 dark:to-gray-950">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/20">
                  <ShieldCheck className="h-7 w-7 text-indigo-600 dark:text-indigo-300" />
                </div>
                <h4 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Full access to everything
                </h4>
                <p className="mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
                  The <span className="font-medium text-gray-800 dark:text-gray-200">Admin</span> role
                  can view and edit every field, entity, and navigation item across all projects. There&apos;s
                  nothing to configure here — its permissions can&apos;t be restricted.
                </p>
              </div>
            ) : selectedRole.name === SPACE_CREATOR_ROLE_NAME ? (
              <div className="flex flex-col items-center justify-center text-center rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50 to-white px-8 py-12 dark:border-blue-400/20 dark:from-blue-500/10 dark:to-gray-950">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20">
                  <ShieldCheck className="h-7 w-7 text-blue-600 dark:text-blue-300" />
                </div>
                <h4 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Can create their own projects
                </h4>
                <p className="mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
                  The <span className="font-medium text-gray-800 dark:text-gray-200">Space Creator</span> role
                  has standard member access <span className="font-medium">plus</span> the ability to create
                  projects. In any project they create they become its <span className="font-medium text-gray-800 dark:text-gray-200">Space Admin</span> (full control of that project).
                  They see only projects they belong to and have no org-wide admin powers. This is a preset role —
                  there&apos;s nothing to configure here.
                </p>
              </div>
            ) : (
            <>
            <nav className="flex gap-6 border-b border-gray-200 dark:border-gray-700">
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
                      ? "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300"
                      : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className="bg-gray-900 text-white rounded-md px-4 py-2.5 flex items-start gap-2 text-xs dark:bg-gray-800/70 dark:ring-1 dark:ring-gray-700">
              <span className="font-semibold">ⓘ</span>
              <span>
                {subTab === "fields" ? (
                  <>
                    Set how each <span className="font-semibold">form field</span> behaves for this role —{" "}
                    <span className="font-semibold">Hidden</span>,{" "}
                    <span className="font-semibold">Read-only</span>,{" "}
                    <span className="font-semibold">Editable</span>, or{" "}
                    <span className="font-semibold">Required</span>. Fields you don&apos;t customise behave as Editable.
                  </>
                ) : (
                  <>
                    Tick an action to grant it. <span className="font-semibold">Module-level</span> ticks select all leaves under that module.
                    A <span className="font-semibold">view</span> grant also shows that item in the sidebar.
                  </>
                )}
              </span>
            </div>

            {subTab === "fields" ? (
              <FieldPermissionMatrix roleId={selectedRole.id} />
            ) : (
              <PermissionMatrix roleId={selectedRole.id} />
            )}
            </>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
            Select a role to view its permissions.
          </div>
        )}
      </section>

      {addOpen && <AddRoleModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}
