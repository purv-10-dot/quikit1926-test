"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronUp, Download, KeyRound, Loader2, Pencil, Search, SlidersHorizontal, Trash2, Upload, UserPlus, X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import Pagination from "@/components/ui/Pagination";
import ImportModal from "@/components/users/ImportModal";
import DeleteConfirmModal from "@/components/users/DeleteConfirmModal";
import type { User } from "@/types/user";
import { AddUserModal } from "./add-user-modal";
import { EditUserModal } from "./edit-user-modal";
import { UserPermissionsModal } from "./user-permissions-modal";
import { RolePill } from "./role-pill";
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

interface Props {
  showToast: (message: string, sub?: string, variant?: "success" | "error") => void;
}

export function UsersTab({ showToast }: Props) {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(""); // "" = all, else an AstAppRole.id
  const [deptFilter, setDeptFilter] = useState("");
  const [deptOptions, setDeptOptions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editUser, setEditUser] = useState<OrgUser | null>(null);
  const [permUser, setPermUser] = useState<OrgUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<OrgUser | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [adv, setAdv] = useState({ employeeId: "", contact: "", designation: "", joiningDate: "", status: "" });

  const advActive = Object.values(adv).filter(Boolean).length;
  const hasFilters =
    search.trim() !== "" || roleFilter !== "" || deptFilter !== "" || advActive > 0;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (roleFilter) params.set("roleId", roleFilter);
      if (deptFilter) params.set("department", deptFilter);
      const qs = params.toString();
      const res = await fetch(`/api/org/users${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      setUsers(json?.data ?? []);
    } catch {
      showToast("Could not load users", undefined, "error");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, deptFilter, showToast]);

  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/org/roles");
      const json = await res.json();
      setRoles(json?.data ?? []);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void loadUsers(), 250);
    return () => clearTimeout(t);
  }, [loadUsers]);

  // Keep the department dropdown options stable: refresh them only from an
  // unfiltered-by-department load, so selecting a department doesn't collapse
  // the option list.
  useEffect(() => {
    if (!deptFilter) {
      setDeptOptions(
        [...new Set(users.map((u) => u.department).filter(Boolean))].sort() as string[],
      );
    }
  }, [users, deptFilter]);

  useEffect(() => setPage(1), [search, roleFilter, deptFilter, adv]);

  // Advanced filters run client-side over the server-filtered rows.
  const filtered = useMemo(
    () =>
      users.filter((u) => {
        if (adv.employeeId && !(u.employeeId ?? "").toLowerCase().includes(adv.employeeId.toLowerCase())) return false;
        if (adv.contact && !(u.contact ?? "").toLowerCase().includes(adv.contact.toLowerCase())) return false;
        if (adv.designation && !(u.designation ?? "").toLowerCase().includes(adv.designation.toLowerCase())) return false;
        if (adv.joiningDate && !(u.joiningDate ?? "").includes(adv.joiningDate)) return false;
        if (adv.status && u.employeeStatus !== adv.status) return false;
        return true;
      }),
    [users, adv],
  );
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  async function handleDelete(user: OrgUser) {
    try {
      const res = await fetch(`/api/org/users/${user.userId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast("Could not remove user", json?.error ?? "Request failed", "error");
        return;
      }
      setDeleteUser(null);
      showToast(
        "Removed from QuikAsset",
        json.data?.employeeKept
          ? `${user.firstName}'s employee record was kept (has asset history).`
          : `${user.firstName} no longer has QuikAsset access.`,
      );
      void loadUsers();
    } catch {
      showToast("Could not remove user", "Network error", "error");
    }
  }

  async function handleImport(imported: Omit<User, "id">[]) {
    try {
      await Promise.all(
        imported.map((u) =>
          fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(u),
          }),
        ),
      );
      setShowImport(false);
      showToast(
        "Employees imported",
        `${imported.length} record${imported.length !== 1 ? "s" : ""} added. Imported employees appear here once they have a login.`,
      );
      void loadUsers();
    } catch {
      showToast("Import failed", "Some rows could not be imported", "error");
    }
  }

  function handleExport() {
    const rows = filtered.map((u, i) => ({
      "S.No": i + 1,
      Name: `${u.firstName} ${u.lastName}`.trim(),
      Email: u.email,
      Role: u.appRoleName ?? "",
      "Employee ID": u.employeeId ?? "",
      Contact: u.contact ?? "",
      Department: u.department ?? "",
      Designation: u.designation ?? "",
      "Joining Date": u.joiningDate ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, `quikasset-users-${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("Export ready", `${rows.length} user${rows.length !== 1 ? "s" : ""} exported.`);
  }

  return (
    <div className="bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Users</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            {filtered.length} {hasFilters ? "matching" : "with QuikAsset access"}
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
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Filter by department"
            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent-400"
          >
            <option value="">All departments</option>
            {deptOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              showFilters || advActive > 0
                ? "border-accent-200 bg-accent-50 text-accent-600 hover:bg-accent-100"
                : "border-gray-200 text-gray-600 hover:bg-gray-50",
            )}
          >
            {showFilters ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <SlidersHorizontal className="h-3.5 w-3.5" />
            )}
            Filters
            {advActive > 0 && (
              <span className="ml-0.5 rounded-full bg-accent-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                {advActive}
              </span>
            )}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
          <PrimaryButton onClick={() => setShowAdd(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            Add user
          </PrimaryButton>
        </div>
      </div>

      {/* Advanced filters (client-side over the loaded rows) */}
      {showFilters && (
        <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Advanced filters
            </p>
            {advActive > 0 && (
              <button
                onClick={() => setAdv({ employeeId: "", contact: "", designation: "", joiningDate: "", status: "" })}
                className="flex items-center gap-1 text-[10px] font-medium text-accent-600 hover:underline"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
            <input
              value={adv.employeeId}
              onChange={(e) => setAdv((f) => ({ ...f, employeeId: e.target.value }))}
              placeholder="Employee ID"
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <input
              value={adv.contact}
              onChange={(e) => setAdv((f) => ({ ...f, contact: e.target.value }))}
              placeholder="Contact"
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <input
              value={adv.designation}
              onChange={(e) => setAdv((f) => ({ ...f, designation: e.target.value }))}
              placeholder="Designation"
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <input
              type="date"
              value={adv.joiningDate}
              onChange={(e) => setAdv((f) => ({ ...f, joiningDate: e.target.value }))}
              aria-label="Joining date"
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <select
              value={adv.status}
              onChange={(e) => setAdv((f) => ({ ...f, status: e.target.value }))}
              aria-label="Filter by status"
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-accent-400"
            >
              <option value="">All statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-y border-gray-100 bg-accent-50 text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 text-left font-semibold">User</th>
              <th className="px-4 py-3 text-left font-semibold">Role</th>
              <th className="px-4 py-3 text-left font-semibold">Employee ID</th>
              <th className="px-4 py-3 text-left font-semibold">Contact</th>
              <th className="px-4 py-3 text-left font-semibold">Department</th>
              <th className="px-4 py-3 text-left font-semibold">Action</th>
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
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  {hasFilters
                    ? "No users match your filters."
                    : "No users with QuikAsset access yet. Click “Add user” to invite someone."}
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
                    <RolePill name={u.appRoleName} />
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-600">{u.employeeId ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{u.contact ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{u.department ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPermUser(u)}
                        title="Manage role & permissions"
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-accent-50 hover:text-accent-600"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditUser(u)}
                        title="Edit user"
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteUser(u)}
                        title="Remove from QuikAsset"
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
        total={filtered.length}
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
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} />
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
        <UserPermissionsModal
          user={permUser}
          roles={roles}
          onClose={() => setPermUser(null)}
          onChanged={loadUsers}
          showToast={showToast}
        />
      )}
      {deleteUser && (
        <DeleteConfirmModal
          userName={`${deleteUser.firstName} ${deleteUser.lastName}`.trim()}
          onClose={() => setDeleteUser(null)}
          onConfirm={() => handleDelete(deleteUser)}
        />
      )}
    </div>
  );
}
