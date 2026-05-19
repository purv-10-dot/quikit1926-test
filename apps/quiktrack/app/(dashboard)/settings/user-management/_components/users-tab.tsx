"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Search,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { Button } from "@quikit/ui";
import { EffectivePermissions } from "./effective-permissions";
import { AddUserModal } from "./add-user-modal";
import { EditUserModal } from "./edit-user-modal";
import { RolePill } from "./role-pill";
import { avatarColorFor } from "@/lib/utils/avatar-color";
import { relativeTimeShort } from "@/lib/utils/relative-time";

interface OrgUserTeam {
  id: string;
  name: string;
}

interface OrgUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  lastSignInAt: string | null;
  appRoleId: string | null;
  appRoleName: string | null;
  teams: OrgUserTeam[];
}

interface AppRole {
  id: string;
  name: string;
  isSystem: boolean;
  isDefault: boolean;
}

export function UsersTab() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<OrgUser | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const usersQ = useQuery({
    queryKey: ["quiktrack", "org-users"],
    queryFn: async () => {
      const r = await fetch("/api/org/users");
      const j = await r.json();
      return (j.data as OrgUser[]) ?? [];
    },
  });

  const rolesQ = useQuery({
    queryKey: ["quiktrack", "org-roles"],
    queryFn: async () => {
      const r = await fetch("/api/org/roles");
      const j = await r.json();
      return (j.data as AppRole[]) ?? [];
    },
  });

  const setRole = useMutation({
    mutationFn: async (vars: { userId: string; roleId: string | null }) => {
      const r = await fetch(`/api/org/users/${vars.userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: vars.roleId }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiktrack", "org-users"] }),
  });

  const users = (usersQ.data ?? []).filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.firstName.toLowerCase().includes(q) ||
      u.lastName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  const total = users.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIdx = (currentPage - 1) * pageSize;
  const pageUsers = users.slice(startIdx, startIdx + pageSize);

  const roles = rolesQ.data ?? [];

  return (
    <div className="px-8 py-6 space-y-4">
      {/* Header strip */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
            <UsersIcon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Users</h2>
            <p className="text-xs text-gray-500">{users.length} active members</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search users…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 w-64 pl-9 pr-3 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            />
          </div>
          {/* TODO: Filter — coming soon
          <button
            type="button"
            className="h-9 px-4 text-sm font-medium text-gray-700 border border-gray-200 rounded-full bg-white hover:bg-gray-50"
          >
            Filter
          </button>
          */}
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 rounded-full"
          >
            + Add User
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left bg-gradient-to-b from-gray-50 to-gray-50/60 border-b border-gray-200">
            <tr className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              <th className="px-5 py-3.5">User</th>
              <th className="px-4 py-3.5">Email</th>
              <th className="px-4 py-3.5">Role</th>
              <th className="px-4 py-3.5">Teams</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Last Sign In</th>
              <th className="px-4 py-3.5 text-right pr-5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {usersQ.isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  No users yet
                </td>
              </tr>
            ) : (
              pageUsers.map((u) => {
                const isOpen = expanded === u.userId;
                const initials =
                  (u.firstName[0] ?? "?") + (u.lastName[0] ?? "");
                const avatarColor = avatarColorFor(u.userId);
                return (
                  <UserRow
                    key={u.userId}
                    user={u}
                    isOpen={isOpen}
                    initials={initials.toUpperCase()}
                    avatarColor={avatarColor}
                    roles={roles}
                    onToggle={() => setExpanded(isOpen ? null : u.userId)}
                    onCollapse={() => setExpanded(null)}
                    onRoleChange={(roleId) =>
                      setRole.mutate({ userId: u.userId, roleId })
                    }
                    onEdit={() => setEditUser(u)}
                  />
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        {total > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-3 text-[12px] text-gray-500">
              <span>
                Showing{" "}
                <span className="font-medium text-gray-700">
                  {startIdx + 1}–{Math.min(startIdx + pageSize, total)}
                </span>{" "}
                of <span className="font-medium text-gray-700">{total}</span>
              </span>
              <span className="text-gray-300">•</span>
              <label className="flex items-center gap-1.5">
                <span>Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-7 pl-2 pr-6 text-[12px] border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {buildPageList(currentPage, pageCount).map((p, i) =>
                p === "…" ? (
                  <span
                    key={`gap-${i}`}
                    className="h-8 w-8 flex items-center justify-center text-gray-400 text-[12px]"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`h-8 min-w-[32px] px-2 text-[12.5px] rounded-md border transition-colors ${
                      p === currentPage
                        ? "bg-blue-600 border-blue-600 text-white font-semibold shadow-sm"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage === pageCount}
                className="h-8 w-8 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {addOpen && <AddUserModal onClose={() => setAddOpen(false)} />}
      {editUser && (
        <EditUserModal
          user={{
            userId: editUser.userId,
            firstName: editUser.firstName,
            lastName: editUser.lastName,
            email: editUser.email,
            status: editUser.status,
          }}
          onClose={() => setEditUser(null)}
        />
      )}
    </div>
  );
}

function UserRow({
  user,
  isOpen,
  initials,
  avatarColor,
  roles,
  onToggle,
  onCollapse,
  onRoleChange,
  onEdit,
}: {
  user: OrgUser;
  isOpen: boolean;
  initials: string;
  avatarColor: string;
  roles: AppRole[];
  onToggle: () => void;
  onCollapse: () => void;
  onRoleChange: (roleId: string | null) => void;
  onEdit: () => void;
}) {
  const active = user.status === "active";
  const isInvited = user.status === "invited";
  const statusLabel = active ? "Active" : isInvited ? "Invited" : "Inactive";
  const statusPill = active
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
    : isInvited
      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
      : "bg-gray-100 text-gray-600 ring-1 ring-gray-200";
  const dotColor = active
    ? "bg-emerald-500"
    : isInvited
      ? "bg-amber-500"
      : "bg-gray-400";

  // Deterministic colored chip for each team (cycle through 5 palettes).
  const teamPalette = [
    "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
    "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100",
    "bg-pink-50 text-pink-700 ring-1 ring-pink-100",
    "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
    "bg-teal-50 text-teal-700 ring-1 ring-teal-100",
  ];

  return (
    <>
      <tr
        className={`group border-b border-gray-100 last:border-b-0 transition-colors ${
          isOpen ? "bg-blue-50/30" : "hover:bg-gray-50/70"
        }`}
      >
        {/* User */}
        <td className="px-5 py-3.5">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-3 font-medium text-gray-900 group/btn"
          >
            <span
              className={`w-8 h-8 rounded-full ${avatarColor} text-white text-[11px] font-semibold flex items-center justify-center ring-2 ring-white shadow-sm`}
            >
              {initials}
            </span>
            <span className="text-[13.5px] group-hover/btn:text-blue-600 transition-colors">
              {user.firstName} {user.lastName}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </button>
        </td>

        {/* Email */}
        <td className="px-4 py-3.5 text-gray-600 text-[13px]">{user.email}</td>

        {/* Role */}
        <td className="px-4 py-3.5">
          <RolePill
            currentRoleId={user.appRoleId}
            currentRoleName={user.appRoleName}
            options={roles}
            onChange={onRoleChange}
          />
        </td>

        {/* Teams */}
        <td className="px-4 py-3.5">
          {user.teams.length === 0 ? (
            <span className="text-gray-300">—</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {user.teams.slice(0, 2).map((t, idx) => (
                <span
                  key={t.id}
                  className={`inline-flex items-center px-2.5 py-1 text-[11.5px] font-medium rounded-md ${
                    teamPalette[idx % teamPalette.length]
                  }`}
                >
                  {t.name}
                </span>
              ))}
              {user.teams.length > 2 && (
                <span className="inline-flex items-center px-2 py-1 text-[11.5px] font-medium text-gray-500 bg-gray-50 ring-1 ring-gray-200 rounded-md">
                  +{user.teams.length - 2}
                </span>
              )}
            </div>
          )}
        </td>

        {/* Status */}
        <td className="px-4 py-3.5">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-semibold rounded-full ${statusPill}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            {statusLabel}
          </span>
        </td>

        {/* Last Sign In */}
        <td className="px-4 py-3.5 text-gray-500 text-[13px]">
          {relativeTimeShort(user.lastSignInAt)}
        </td>

        {/* Actions */}
        <td className="px-4 py-3.5 pr-5 text-right">
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              title="Edit user"
              onClick={onEdit}
              className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors opacity-60 group-hover:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {/* TODO: Manage team membership — coming soon
            <button
              type="button"
              title="Manage team membership"
              className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            >
              <UserPlus className="h-3.5 w-3.5" />
            </button>
            */}
          </div>
        </td>
      </tr>

      {isOpen && (
        <tr className="bg-blue-50/30 border-b border-gray-100">
          <td colSpan={7} className="px-6 py-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4 relative">
              <button
                type="button"
                onClick={onCollapse}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
              <EffectivePermissions
                userId={user.userId}
                roleName={user.appRoleName ?? "—"}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Compact page-list with leading/trailing ellipsis. Always shows first +
// last; up to 2 neighbours around the current page.
function buildPageList(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}
