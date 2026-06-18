"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, Lock, Search, Users as UsersIcon, X } from "lucide-react";
import { Button } from "@quikit/ui";
import { EffectivePermissions } from "./effective-permissions";
import { AddMemberModal } from "./add-member-modal";
import { RolePicker } from "./role-picker";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";

interface Member {
  id: string;
  userId: string;
  role: string; // legacy enum
  projectRoleId: string | null;
  projectRole: { id: string; name: string } | null;
  status: string;
  joinedAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
    lastSignInAt: string | null;
  } | null;
}

interface ProjectRole {
  id: string;
  name: string;
  isDefault: boolean;
}

export function MembersTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const perms = useMyProjectPermissions(projectId);
  // Granular gates per action. Page-level guard only required `:view`, so a
  // Contributor can read the member list — but mutations get disabled
  // unless they hold the matching perm.
  const canAdd = perms.loading || perms.has("ProjectMember", "create");
  // Only app-wide admins (tenant admin / super admin) can change a member's
  // project role. Project-level "ProjectMember:update" no longer unlocks the
  // role picker — matches the role-catalogue editor gate.
  const canUpdateRoles = perms.loading || perms.isAdmin;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const membersQ = useQuery({
    queryKey: ["quiktrack", "project-members", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/members`);
      const j = await r.json();
      return ((j.data?.members ?? j.data ?? []) as Member[]) ?? [];
    },
  });

  const rolesQ = useQuery({
    queryKey: ["quiktrack", "project-roles", projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/roles`);
      const j = await r.json();
      return (j.data as ProjectRole[]) ?? [];
    },
  });

  const setRole = useMutation({
    mutationFn: async (vars: { userId: string; projectRoleId: string | null }) => {
      const r = await fetch(`/api/projects/${projectId}/members/${vars.userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectRoleId: vars.projectRoleId }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["quiktrack", "project-members", projectId] }),
  });

  const members = (membersQ.data ?? []).filter((m) => {
    if (!search || !m.user) return true;
    const q = search.toLowerCase();
    return (
      m.user.firstName.toLowerCase().includes(q) ||
      m.user.lastName.toLowerCase().includes(q) ||
      m.user.email.toLowerCase().includes(q)
    );
  });

  const roles = rolesQ.data ?? [];

  const totalPages = Math.max(1, Math.ceil(members.length / pageSize));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => { setPage(1); }, [search, pageSize]);
  const pageStart = (Math.min(page, totalPages) - 1) * pageSize;
  const pageMembers = members.slice(pageStart, pageStart + pageSize);

  return (
    <div className="px-8 py-6 space-y-4">
      {!perms.loading && !canUpdateRoles && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-[12px] text-amber-800">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">Read-only</span> — you can see the member list,
            but only <span className="font-medium">app admins</span> can change a member&apos;s
            project role here. Ask a tenant admin if you need changes.
          </span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
            <UsersIcon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Project members</h2>
            <p className="text-xs text-gray-500">{members.length} member{members.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-64 pl-9 pr-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          {canAdd && (
            <Button size="sm" onClick={() => setAddOpen(true)} className="bg-blue-600 hover:bg-blue-700">
              + Add Member
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Project Role</th>
              <th className="px-4 py-3">Legacy</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {membersQ.isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No members yet</td></tr>
            ) : pageMembers.map((m) => {
              const isOpen = expanded === m.userId;
              return (
                <>
                  <tr key={m.userId} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : m.userId)}
                        className="flex items-center gap-2 font-medium text-gray-900"
                      >
                        <span className="w-7 h-7 rounded-full bg-purple-500 text-white text-xs font-semibold flex items-center justify-center">
                          {(m.user?.firstName?.[0] ?? "?") + (m.user?.lastName?.[0] ?? "")}
                        </span>
                        <span>{m.user?.firstName} {m.user?.lastName}</span>
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{m.user?.email}</td>
                    <td className="px-4 py-3">
                      {canUpdateRoles ? (
                        <RolePicker
                          value={m.projectRoleId}
                          roles={roles}
                          onChange={(next) =>
                            setRole.mutate({ userId: m.userId, projectRoleId: next })
                          }
                        />
                      ) : (
                        <span
                          title="You don't have permission to change member roles. Ask the project admin (ProjectMember:update)."
                          className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 ring-1 ring-gray-200 rounded px-2 py-1 cursor-not-allowed"
                        >
                          <Lock className="h-3 w-3 text-gray-400" />
                          {m.projectRole?.name ?? "Unassigned"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{m.role}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-6 py-4">
                        <div className="bg-white border border-gray-200 rounded-lg p-4 relative">
                          <button
                            type="button"
                            onClick={() => setExpanded(null)}
                            className="absolute top-3 right-3 text-gray-400 hover:text-gray-700"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <EffectivePermissions
                            projectId={projectId}
                            userId={m.userId}
                            roleName={m.projectRole?.name ?? null}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {members.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/60 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                className="h-7 px-2 rounded border border-gray-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span>
                {members.length === 0
                  ? "0"
                  : `${pageStart + 1}–${Math.min(pageStart + pageSize, members.length)} of ${members.length}`}
              </span>
              <div className="flex items-center">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="mx-2 tabular-nums">
                  Page <span className="font-medium text-gray-900">{Math.min(page, totalPages)}</span> of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 w-7 inline-flex items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {addOpen && <AddMemberModal projectId={projectId} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
