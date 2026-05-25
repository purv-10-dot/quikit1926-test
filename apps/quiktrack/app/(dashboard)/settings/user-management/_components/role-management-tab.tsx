"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Shield, Trash2 } from "lucide-react";
import { PermissionMatrix } from "./permission-matrix";
import { FieldPermissionMatrix } from "./field-permission-matrix";
import { NavigationPanel } from "./navigation-panel";
import { AddRoleModal } from "./add-role-modal";

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
  const [subTab, setSubTab] = useState<"fields" | "entities" | "navigation">("fields");
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
      <aside className="w-72 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-200">
          <div className="text-[10px] font-semibold tracking-wider uppercase text-indigo-700">
            App-wide
          </div>
          <div className="text-xs text-indigo-900">
            Applies across every space
          </div>
        </div>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">App-wide roles</h2>
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
                  <Shield className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />
                  <span className="truncate">{r.name}</span>
                  {r.isDefault && (
                    <span className="text-[9px] uppercase tracking-wider bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      Default
                    </span>
                  )}
                </span>
                {!r.isSystem && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete role "${r.name}"?`)) del.mutate(r.id);
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
              <Shield className="h-4 w-4 text-indigo-500" />
              <span className="text-[10px] font-semibold tracking-wider uppercase bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                App-wide
              </span>
            </div>

            <nav className="flex gap-6 border-b border-gray-200">
              {(
                [
                  { k: "fields" as const, label: "Fields" },
                  { k: "entities" as const, label: "Entities" },
                  { k: "navigation" as const, label: "Navigation" },
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
                {subTab === "fields" ? (
                  <>
                    Set how each <span className="font-semibold">form field</span> behaves for this role —{" "}
                    <span className="font-semibold">Hidden</span>,{" "}
                    <span className="font-semibold">Read-only</span>,{" "}
                    <span className="font-semibold">Editable</span>, or{" "}
                    <span className="font-semibold">Required</span>. Fields you don&apos;t customise behave as Editable.
                  </>
                ) : subTab === "entities" ? (
                  <>
                    Tick an action to grant it. <span className="font-semibold">Module-level</span> ticks select all leaves under that module.
                  </>
                ) : (
                  <>Toggle which sidebar items this role can see.</>
                )}
              </span>
            </div>

            {subTab === "fields" ? (
              <FieldPermissionMatrix roleId={selectedRole.id} />
            ) : subTab === "entities" ? (
              <PermissionMatrix roleId={selectedRole.id} />
            ) : (
              <NavigationPanel roleId={selectedRole.id} />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            Select a role to view its permissions.
          </div>
        )}
      </section>

      {addOpen && <AddRoleModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}
