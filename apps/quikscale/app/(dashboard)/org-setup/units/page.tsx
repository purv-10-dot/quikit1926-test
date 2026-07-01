"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Trash2, X } from "lucide-react";
import { AddButton } from "@quikit/ui";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import { notify } from "@/lib/utils/notify";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UnitItem {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

type FormState = { name: string; description: string };
const EMPTY_FORM: FormState = { name: "", description: "" };

// ── Add / Edit panel ──────────────────────────────────────────────────────────

function UnitPanel({
  editItem,
  onClose,
  canCreate = true,
  canUpdate = true,
}: {
  editItem: UnitItem | null;
  onClose: () => void;
  canCreate?: boolean;
  canUpdate?: boolean;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(
    editItem ? { name: editItem.name, description: editItem.description ?? "" } : EMPTY_FORM,
  );
  const [errors, setErrors] = useState<Partial<FormState>>({});

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: "" }));
  }

  const saveMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const url = editItem ? `/api/units/${editItem.id}` : "/api/units";
      const method = editItem ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, description: data.description }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to save");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      onClose();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setErrors({ name: "Unit Name is required" }); return; }
    saveMutation.mutate(form);
  }

  const locked = editItem ? !canUpdate : !canCreate;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Unit Master</h2>
            <p className="text-sm text-gray-500 mt-0.5">{editItem ? "Edit record" : "Create new record"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {locked && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              Read-only — your role doesn&apos;t grant {editItem ? "update" : "create"} access on Unit Master.
            </div>
          )}
          <fieldset disabled={locked} className={`space-y-5 ${locked ? "opacity-70" : ""}`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Unit Name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="e.g. Leads, Calls, kg"
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent ${errors.name ? "border-red-400" : "border-gray-300"}`}
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={e => set("description", e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent resize-none"
              />
            </div>

            {saveMutation.isError && (
              <p className="text-red-500 text-xs">{(saveMutation.error as Error).message}</p>
            )}
          </fieldset>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
            {(editItem ? canUpdate : canCreate) && (
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {saveMutation.isPending ? "Saving…" : editItem ? "Update" : "Submit"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UnitMasterPage() {
  const { canCreate, canUpdate, canDelete } = useResourcePermissions("Unit");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [editItem, setEditItem] = useState<UnitItem | null>(null);

  const { data, isLoading } = useQuery<{ success: boolean; data: UnitItem[] }>({
    queryKey: ["units", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("limit", "100");
      const res = await fetch(`/api/units?${params}`);
      return res.json();
    },
  });

  const items: UnitItem[] = data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => fetch(`/api/units/${id}`, { method: "DELETE" })));
    },
    onSuccess: () => {
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["units"] });
    },
  });

  const allChecked = items.length > 0 && items.every(i => selected.has(i.id));
  function toggleAll() { setSelected(allChecked ? new Set() : new Set(items.map(i => i.id))); }
  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openAdd() { setEditItem(null); setPanelOpen(true); }
  function openEdit(item: UnitItem) { setEditItem(item); setPanelOpen(true); }
  function closePanel() { setPanelOpen(false); setEditItem(null); }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">Unit Master</h1>
            <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400 w-44"
              />
            </div>

            {selected.size > 0 && canDelete && (
              <button
                onClick={() => deleteMutation.mutate([...selected])}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete ({selected.size})
              </button>
            )}

            {canCreate && <AddButton onClick={openAdd}>Add Unit</AddButton>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 min-h-0">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-accent-50 border-b border-gray-200">
                <th className="w-10 px-3 py-3">
                  <label
                    onClickCapture={(e) => {
                      if (!canDelete) { e.preventDefault(); e.stopPropagation(); notify.error("You don't have permission to delete"); }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll} disabled={!canDelete}
                      className={`w-4 h-4 rounded border-gray-300 accent-blue-600 ${!canDelete ? "opacity-40 cursor-not-allowed" : ""}`}
                    />
                  </label>
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-16">ID</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Unit Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-400">Loading…</td></tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-400">
                    No units yet. Click <strong>Add Unit</strong> to create one.
                  </td>
                </tr>
              )}
              {items.map((item, idx) => {
                const isChecked = selected.has(item.id);
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${isChecked ? "bg-accent-50" : ""}`}
                    onClick={() => openEdit(item)}
                  >
                    <td className="w-10 px-3 py-3" onClick={e => {
                      e.stopPropagation();
                      if (!canDelete) { notify.error("You don't have permission to delete"); return; }
                      toggleOne(item.id);
                    }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => { if (canDelete) toggleOne(item.id); }} disabled={!canDelete}
                        className={`w-4 h-4 rounded border-gray-300 accent-blue-600 ${!canDelete ? "opacity-40 cursor-not-allowed" : ""}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-accent-600 font-semibold">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                    <td className="px-4 py-3 text-gray-500 truncate max-w-xs">{item.description || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {panelOpen && <UnitPanel editItem={editItem} onClose={closePanel} canCreate={canCreate} canUpdate={canUpdate} />}
    </div>
  );
}
