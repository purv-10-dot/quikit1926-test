"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Pencil, Search, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import Pagination from "@/components/ui/Pagination";
import { AddUserModal } from "./add-user-modal";
import { EditUserModal } from "./edit-user-modal";
import { UserPermissionsModal } from "./user-permissions-modal";
import { PrimaryButton } from "./shared";
import type { OrgUser, Role } from "./types";

const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-600", "bg-red-500",
];

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}
function avatarColor(id: string) {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
}

interface Props {
  showToast: (message: string, sub?: string, variant?: "success" | "error") => void;
}

export function UsersTab({ showToast }: Props) {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // "" = all roles, "none" = users with no app role, otherwise an AstAppRole.id
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<OrgUser | null>(null);
  const [permUser, setPermUser] = useState<OrgUser | null>(null);

  const hasFilters = search.trim() !== "" || roleFilter !== "" || statusFilter !== "";

  // Users are filtered server-side; rebuilt whenever a filter changes.
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (roleFilter) params.set("roleId", roleFilter);
      if (statusFilter) params.set("status", statusFilter);
      const qs = params.toString();
      const res = await fetch(`/api/org/users${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      setUsers(json?.data ?? []);
    } catch {
      showToast("Could not load users", undefined, "error");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, showToast]);

  // Roles rarely change and feed both the filter dropdown and the row selects,
  // so they load once on mount rather than on every filter change.
  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/org/roles");
      const json = await res.json();
      setRoles(json?.data ?? []);
    } catch {
      /* non-critical: the table still renders without the roles list */
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void loadUsers(), 250);
    return () => clearTimeout(t);
  }, [loadUsers]);

  useEffect(() => setPage(1), [search, roleFilter, statusFilter]);
  const paginated = users.slice((page - 1) * pageSize, page * pageSize);

  async function changeRole(user: OrgUser, roleId: string) {
    const prev = users;
    const target = roleId ? roles.find((r) => r.id === roleId) ?? null : null;
    setUsers((list) =>
      list.map((u) =>
        u.userId === user.userId
          ? { ...u, appRoleId: roleId || null, appRoleName: target?.name ?? null }
          : u,
      ),
    );
    try {
      const res = await fetch(`/api/org/users/${user.userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: roleId || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setUsers(prev);
        showToast("Could not change role", json?.error ?? "Request failed", "error");
        return;
      }
      showToast("Role updated", `${user.firstName}'s role is now ${target?.name ?? "None"}.`);
    } catch {
      setUsers(prev);
      showToast("Could not change role", "Network error", "error");
    }
  }

  async function toggleStatus(user: OrgUser) {
    const next = user.status === "active" ? "inactive" : "active";
    const prev = users;
    setUsers((list) => list.map((u) => (u.userId === user.userId ? { ...u, status: next } : u)));
    try {
      const res = await fetch(`/api/org/users/${user.userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setUsers(prev);
        showToast("Could not update status", json?.error ?? "Request failed", "error");
      }
    } catch {
      setUsers(prev);
      showToast("Could not update status", "Network error", "error");
    }
  }

  return (
    <div className="bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Users</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            {users.length} {hasFilters ? "matching" : "with QuikAsset access"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
              className="w-52 rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Filter by role"
            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
          >
            <option value="">All roles</option>
            <option value="none">No role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")}
            aria-label="Filter by status"
            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <PrimaryButton onClick={() => setShowAdd(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            Add user
          </PrimaryButton>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-y border-gray-100 bg-accent-50 text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 text-left font-semibold">User</th>
              <th className="px-4 py-3 text-left font-semibold">Role</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Last sign-in</th>
              <th className="px-4 py-3 text-left font-semibold">Joined</th>
              <th className="px-4 py-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-gray-400">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
                  </span>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No users with QuikAsset access yet. Click “Add user” to invite someone.
                </td>
              </tr>
            ) : (
              paginated.map((u) => (
                <tr key={u.userId} className="border-t border-gray-100 hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                          avatarColor(u.userId),
                        )}
                      >
                        {initials(u.firstName, u.lastName)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-800">
                          {u.firstName} {u.lastName}
                        </p>
                        <p className="truncate text-[10px] text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.appRoleId ?? ""}
                      onChange={(e) => changeRole(u, e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs capitalize focus:outline-none focus:ring-2 focus:ring-accent-400"
                    >
                      <option value="">No role</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleStatus(u)}
                        title={`Mark ${u.status === "active" ? "inactive" : "active"}`}
                        className={cn(
                          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                          u.status === "active" ? "bg-green-500" : "bg-gray-300",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                            u.status === "active" ? "translate-x-4" : "translate-x-1",
                          )}
                        />
                      </button>
                      <span
                        className={cn(
                          "text-[10px] font-semibold capitalize",
                          u.status === "active" ? "text-green-600" : "text-gray-400",
                        )}
                      >
                        {u.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(u.lastSignInAt)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(u.joinedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditUser(u)}
                        title="Edit user"
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setPermUser(u)}
                        title="Permissions"
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-accent-50 hover:text-accent-600"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        total={users.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        className="px-4"
      />

      {showAdd && (
        <AddUserModal
          roles={roles}
          onClose={() => setShowAdd(false)}
          onCreated={loadUsers}
          showToast={showToast}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={loadUsers}
          showToast={showToast}
        />
      )}
      {permUser && (
        <UserPermissionsModal user={permUser} onClose={() => setPermUser(null)} showToast={showToast} />
      )}
    </div>
  );
}
