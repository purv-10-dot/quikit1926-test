"use client";

/**
 * Super Admin: Platform Users — /users-admin
 *
 * View all users across all tenants. Search, filter by tenant,
 * view activity. Platform-wide user management.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  Plus,
  Eye,
  ShieldAlert,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface UserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  lastSignInAt: string | null;
  membershipCount: number;
}

/* ── Slide-in Panel ─────────────────────────────────────────────── */
function SlidePanel({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 bg-black/30"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: 480 }}
            animate={{ x: 0 }}
            exit={{ x: 480 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="w-[480px] bg-white h-full shadow-2xl flex flex-col"
          >
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              {children}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
              {footer}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default function PlatformUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Create panel
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    password: "",
    isSuperAdmin: false,
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchUsers = useCallback(() => {
    setLoading(true);
    fetch(`/api/super/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setUsers(j.data);
          setTotalPages(j.pagination.totalPages);
          setTotal(j.pagination.total);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset page to 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === users.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map((u) => u.id)));
    }
  }

  async function handleBulkGrantSuperAdmin() {
    if (!window.confirm(`Are you sure you want to grant Super Admin to ${selected.size} user(s)?`)) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/super/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grant_super_admin", ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Bulk operation failed");
      setSelected(new Set());
      fetchUsers();
    } catch {
      // silently fail
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkRevokeSuperAdmin() {
    if (!window.confirm(`Are you sure you want to revoke Super Admin from ${selected.size} user(s)?`)) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/super/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_super_admin", ids: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Bulk operation failed");
      setSelected(new Set());
      fetchUsers();
    } catch {
      // silently fail
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/super/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to create user");
      setCreateOpen(false);
      setCreateForm({
        email: "",
        firstName: "",
        lastName: "",
        password: "",
        isSuperAdmin: false,
      });
      fetchUsers();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create user",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleSuperAdmin(user: UserInfo) {
    const action = user.isSuperAdmin
      ? "remove super admin from"
      : "grant super admin to";
    if (
      !window.confirm(
        `Are you sure you want to ${action} ${user.firstName} ${user.lastName}?`,
      )
    )
      return;
    try {
      const res = await fetch(`/api/super/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSuperAdmin: !user.isSuperAdmin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to update user");
      fetchUsers();
    } catch {
      // silent
    }
  }

  const inputCls =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400";
  const labelCls = "text-xs font-medium text-gray-600 block mb-1.5";

  return (
    <div>
      {/* Page header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Platform Users</h1>
          <p className="text-sm text-gray-500">
            {total} users across all organizations
          </p>
        </div>
        <button
          onClick={() => {
            setCreateError("");
            setCreateOpen(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" /> Create User
        </button>
      </div>

      {/* Controls bar */}
      <div className="px-6 py-3 border-b border-gray-200 flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="text-sm text-gray-400 py-12 text-center">
            Loading...
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No users found.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={users.length > 0 && selected.size === users.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    User
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Email
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Orgs
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Role
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                    Last Sign In
                  </th>
                  <th className="px-4 py-2.5 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-gray-50/60 transition-colors group cursor-pointer"
                    onClick={() => router.push(`/platform-users/${u.id}`)}
                  >
                    <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleSelect(u.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {u.firstName} {u.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 text-[11px] font-medium">
                        {u.membershipCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.isSuperAdmin ? (
                        <span className="bg-red-50 text-red-700 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                          Super Admin
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">User</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {u.lastSignInAt
                        ? new Date(u.lastSignInAt).toLocaleString()
                        : "Never"}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            router.push(`/platform-users/${u.id}`)
                          }
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleSuperAdmin(u)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            u.isSuperAdmin
                              ? "text-gray-400 hover:text-red-600 hover:bg-red-50"
                              : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                          }`}
                          title={
                            u.isSuperAdmin
                              ? "Remove Super Admin"
                              : "Grant Super Admin"
                          }
                        >
                          <ShieldAlert className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-500">
                  Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 text-xs text-gray-600">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button onClick={handleBulkGrantSuperAdmin} disabled={bulkLoading} className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 rounded-lg">
            {bulkLoading ? "Processing..." : "Grant Super Admin"}
          </button>
          <button onClick={handleBulkRevokeSuperAdmin} disabled={bulkLoading} className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 rounded-lg">
            {bulkLoading ? "Processing..." : "Revoke Super Admin"}
          </button>
          <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-xs text-white/70 hover:text-white">
            Clear
          </button>
        </div>
      )}

      {/* Create slide-in panel */}
      <SlidePanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create User"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-user-form"
              disabled={creating}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        }
      >
        {createError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {createError}
          </div>
        )}
        <form
          id="create-user-form"
          onSubmit={handleCreate}
          className="space-y-5"
        >
          <div>
            <label className={labelCls}>Email</label>
            <input
              type="email"
              required
              value={createForm.email}
              onChange={(e) =>
                setCreateForm({ ...createForm, email: e.target.value })
              }
              className={inputCls}
              placeholder="user@example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First Name</label>
              <input
                type="text"
                required
                value={createForm.firstName}
                onChange={(e) =>
                  setCreateForm({ ...createForm, firstName: e.target.value })
                }
                className={inputCls}
                placeholder="John"
              />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input
                type="text"
                required
                value={createForm.lastName}
                onChange={(e) =>
                  setCreateForm({ ...createForm, lastName: e.target.value })
                }
                className={inputCls}
                placeholder="Doe"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Password</label>
            <input
              type="password"
              required
              value={createForm.password}
              onChange={(e) =>
                setCreateForm({ ...createForm, password: e.target.value })
              }
              className={inputCls}
              placeholder="Minimum 8 characters"
              minLength={8}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isSuperAdmin"
              checked={createForm.isSuperAdmin}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  isSuperAdmin: e.target.checked,
                })
              }
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="isSuperAdmin" className="text-sm text-gray-700">
              Super Admin
            </label>
          </div>
        </form>
      </SlidePanel>
    </div>
  );
}
