"use client";

/**
 * Super Admin: App Registry — /apps-admin
 *
 * Manage the platform's app catalog. Publish/unpublish apps,
 * view OAuth client details, manage app metadata.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  Plus,
  ExternalLink,
  Key,
  Settings,
  Search,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface AppInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  baseUrl: string;
  status: string;
  createdAt: string;
  hasOAuthClient: boolean;
}

const STATUSES = ["active", "coming_soon", "disabled"];

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-50 text-green-700",
    coming_soon: "bg-amber-50 text-amber-700",
    disabled: "bg-gray-100 text-gray-600",
  };
  const labels: Record<string, string> = {
    active: "Active",
    coming_soon: "Coming Soon",
    disabled: "Disabled",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status] || "bg-gray-100 text-gray-600"}`}
    >
      {labels[status] || status}
    </span>
  );
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

export default function AppRegistryPage() {
  const router = useRouter();
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Create panel
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    slug: "",
    baseUrl: "",
    description: "",
    status: "active",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Edit panel
  const [editOpen, setEditOpen] = useState(false);
  const [editApp, setEditApp] = useState<AppInfo | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    baseUrl: "",
    description: "",
    status: "",
  });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");

  const fetchApps = useCallback(() => {
    setLoading(true);
    fetch(`/api/super/apps?page=${page}&limit=20&search=${encodeURIComponent(search)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setApps(j.data);
          setTotalPages(j.pagination.totalPages);
          setTotal(j.pagination.total);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  // Reset page to 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  function openEdit(app: AppInfo) {
    setEditApp(app);
    setEditForm({
      name: app.name,
      baseUrl: app.baseUrl,
      description: app.description || "",
      status: app.status,
    });
    setEditError("");
    setEditOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/super/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to register app");
      setCreateOpen(false);
      setCreateForm({
        name: "",
        slug: "",
        baseUrl: "",
        description: "",
        status: "active",
      });
      fetchApps();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to register app",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editApp) return;
    setEditing(true);
    setEditError("");
    try {
      const res = await fetch(`/api/super/apps/${editApp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to update app");
      setEditOpen(false);
      setEditApp(null);
      fetchApps();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to update app",
      );
    } finally {
      setEditing(false);
    }
  }

  async function handleDisable(app: AppInfo) {
    if (!window.confirm(`Are you sure you want to disable "${app.name}"?`))
      return;
    try {
      const res = await fetch(`/api/super/apps/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Failed to disable app");
      fetchApps();
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
          <h1 className="text-xl font-bold text-gray-900">App Registry</h1>
          <p className="text-sm text-gray-500">
            {total} apps registered on the platform
          </p>
        </div>
        <button
          onClick={() => {
            setCreateError("");
            setCreateOpen(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" /> Register App
        </button>
      </div>

      {/* Controls bar */}
      <div className="px-6 py-3 border-b border-gray-200 flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>

      {/* Card grid */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="text-sm text-gray-400 py-12 text-center">
            Loading...
          </div>
        ) : apps.length === 0 ? (
          <div className="text-center py-12">
            <LayoutGrid className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No apps registered yet.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {apps.map((app) => (
                <div
                  key={app.id}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group"
                  onClick={() => router.push(`/app-registry/${app.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {app.name}
                      </h3>
                      <p className="text-xs text-gray-500">{app.slug}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={app.status} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(app);
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors opacity-0 group-hover:opacity-100"
                        title="Edit app"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {app.description && (
                    <p className="text-xs text-gray-600 mb-3 line-clamp-2">
                      {app.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> {app.baseUrl}
                    </span>
                    {app.hasOAuthClient ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-green-50 text-green-700 text-[11px] font-medium">
                        <Key className="h-3 w-3" /> OAuth
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] font-medium">
                        <Key className="h-3 w-3" /> No OAuth
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 mt-4 border border-gray-200 rounded-xl bg-gray-50">
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
          </>
        )}
      </div>

      {/* Create slide-in panel */}
      <SlidePanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Register App"
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
              form="create-app-form"
              disabled={creating}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {creating ? "Registering..." : "Register"}
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
          id="create-app-form"
          onSubmit={handleCreate}
          className="space-y-5"
        >
          <div>
            <label className={labelCls}>Name</label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  name: e.target.value,
                  slug: slugify(e.target.value),
                })
              }
              className={inputCls}
              placeholder="QuikScale"
            />
          </div>
          <div>
            <label className={labelCls}>Slug</label>
            <input
              type="text"
              required
              value={createForm.slug}
              onChange={(e) =>
                setCreateForm({ ...createForm, slug: e.target.value })
              }
              className={`${inputCls} bg-gray-50`}
              placeholder="quikscale"
            />
            <p className="text-xs text-gray-400 mt-1">
              Auto-generated from name.
            </p>
          </div>
          <div>
            <label className={labelCls}>Base URL</label>
            <input
              type="url"
              required
              value={createForm.baseUrl}
              onChange={(e) =>
                setCreateForm({ ...createForm, baseUrl: e.target.value })
              }
              className={inputCls}
              placeholder="https://app.quikit.com"
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={createForm.description}
              onChange={(e) =>
                setCreateForm({ ...createForm, description: e.target.value })
              }
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="Brief description of the app..."
            />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select
              value={createForm.status}
              onChange={(e) =>
                setCreateForm({ ...createForm, status: e.target.value })
              }
              className={inputCls}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "coming_soon"
                    ? "Coming Soon"
                    : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </form>
      </SlidePanel>

      {/* Edit slide-in panel */}
      <SlidePanel
        open={editOpen && !!editApp}
        onClose={() => setEditOpen(false)}
        title="Edit App"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            {editApp && editApp.status !== "disabled" && (
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  handleDisable(editApp);
                }}
                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Disable
              </button>
            )}
            <button
              type="submit"
              form="edit-app-form"
              disabled={editing}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {editing ? "Saving..." : "Save Changes"}
            </button>
          </div>
        }
      >
        {editError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {editError}
          </div>
        )}
        <form id="edit-app-form" onSubmit={handleEdit} className="space-y-5">
          <div>
            <label className={labelCls}>Name</label>
            <input
              type="text"
              required
              value={editForm.name}
              onChange={(e) =>
                setEditForm({ ...editForm, name: e.target.value })
              }
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Slug</label>
            <input
              type="text"
              disabled
              value={editApp?.slug || ""}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-500"
            />
          </div>
          <div>
            <label className={labelCls}>Base URL</label>
            <input
              type="url"
              required
              value={editForm.baseUrl}
              onChange={(e) =>
                setEditForm({ ...editForm, baseUrl: e.target.value })
              }
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={editForm.description}
              onChange={(e) =>
                setEditForm({ ...editForm, description: e.target.value })
              }
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select
              value={editForm.status}
              onChange={(e) =>
                setEditForm({ ...editForm, status: e.target.value })
              }
              className={inputCls}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "coming_soon"
                    ? "Coming Soon"
                    : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </form>
      </SlidePanel>
    </div>
  );
}
