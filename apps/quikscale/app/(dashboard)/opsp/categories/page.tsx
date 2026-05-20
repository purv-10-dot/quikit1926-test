"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Trash2, X, ChevronDown, Check, Info } from "lucide-react";
import { CURRENCIES } from "@/lib/utils/currency";
import { AddButton } from "@quikit/ui";
import { useResourcePermissions } from "@/lib/hooks/useResourcePermissions";
import {
  CATEGORY_TYPE_LABELS,
  CATEGORY_TYPE_INFO,
  type CategoryType as CategoryTypeEnum,
} from "@/lib/utils/breakdownCalc";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CategoryItem {
  id: string;
  name: string;
  dataType: string;
  currency: string | null;
  description: string | null;
  /// "Cumulative" | "CumulativeTillEnd" | "Standalone" — distribution shape.
  categoryType?: string;
  /// "Manual" | "Automatic" — fill mode.
  breakdownType?: string;
  createdAt: string;
}

type CategoryType = CategoryTypeEnum;

type FormState = {
  name: string;
  dataType: string;
  currency: string;
  description: string;
  // Category-type axis is user-selectable. The legacy `breakdownType` axis is
  // always persisted as "Automatic" — the Manual option was removed from the
  // UI per spec, so this form no longer tracks it.
  categoryType: CategoryType;
};

const DATA_TYPES = ["Number", "Percentage", "Currency"] as const;
const EMPTY_FORM: FormState = {
  name: "",
  dataType: "",
  currency: "NONE",
  description: "",
  categoryType: "Cumulative",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function currencySymbol(code: string | null) {
  if (!code || code === "NONE") return null;
  return CURRENCIES.find(c => c.code === code)?.symbol ?? null;
}

// Soft-color badges for the Category Type axis. The Breakdown Type axis is
// always "Automatic" now — we no longer render a badge for it.
const CATEGORY_TYPE_STYLE: Record<string, string> = {
  Cumulative: "bg-blue-50 text-blue-700",
  CumulativeTillEnd: "bg-purple-50 text-purple-700",
  Standalone: "bg-emerald-50 text-emerald-700",
};

function BreakdownBadges({ categoryType }: { categoryType?: string }) {
  const cKey =
    categoryType && CATEGORY_TYPE_LABELS[categoryType as CategoryType]
      ? (categoryType as CategoryType)
      : "Cumulative";
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_TYPE_STYLE[cKey]}`}>
        {CATEGORY_TYPE_LABELS[cKey]}
      </span>
    </div>
  );
}

// ── Currency picker ───────────────────────────────────────────────────────────

function CurrencyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = [
    { code: "NONE", symbol: "", name: "None" },
    ...CURRENCIES,
  ].filter(c =>
    !search || c.code.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const selected = value === "NONE" || !value
    ? { code: "NONE", symbol: "", name: "None" }
    : CURRENCIES.find(c => c.code === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
      >
        <span className="text-gray-700">
          {selected?.symbol ? <span className="font-medium mr-1">{selected.symbol}</span> : null}
          {selected?.code ?? "NONE"}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(""); }} />
          <div className="absolute top-full mt-1 left-0 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            {/* Search */}
            <div className="px-3 py-2 border-b border-gray-100">
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search currency..."
                  className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
                />
              </div>
            </div>
            {/* List */}
            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => { onChange(c.code); setOpen(false); setSearch(""); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-50 text-left"
                >
                  <span className="w-6 text-center text-gray-500 font-medium text-xs">{c.symbol || ""}</span>
                  <span className="font-medium text-gray-800 w-10">{c.code}</span>
                  <span className="text-gray-500 flex-1">- {c.name}</span>
                  {value === c.code && <Check className="h-3.5 w-3.5 text-accent-500 flex-shrink-0" />}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-400 text-center">No currencies found</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Add / Edit panel ──────────────────────────────────────────────────────────

function CategoryPanel({
  editItem,
  onClose,
  canCreate = true,
  canUpdate = true,
}: {
  editItem: CategoryItem | null;
  onClose: () => void;
  /** RBAC v2 — when create or update is denied, the form becomes read-only
   *  and Save is hidden. */
  canCreate?: boolean;
  canUpdate?: boolean;
}) {
  const queryClient = useQueryClient();

  // Load existing categories so we can pre-check for duplicates on the client.
  // Server also enforces via DB unique index — this is UX polish.
  const { data: existingData } = useQuery<{ success: boolean; data: CategoryItem[] }>({
    queryKey: ["categories-for-dupecheck"],
    queryFn: async () => {
      const res = await fetch("/api/categories?limit=1000");
      return res.json();
    },
  });
  const existing = existingData?.data ?? [];

  const [form, setForm] = useState<FormState>(
    editItem
      ? {
          name: editItem.name,
          dataType: editItem.dataType,
          currency: editItem.currency ?? "NONE",
          description: editItem.description ?? "",
          categoryType: (CATEGORY_TYPE_LABELS[editItem.categoryType as CategoryType]
            ? (editItem.categoryType as CategoryType)
            : "Cumulative"),
        }
      : EMPTY_FORM
  );
  const [errors, setErrors] = useState<Partial<FormState>>({});

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: "" }));
  }

  const saveMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const url = editItem ? `/api/categories/${editItem.id}` : "/api/categories";
      const method = editItem ? "PUT" : "POST";
      const body = {
        name: data.name,
        dataType: data.dataType,
        currency: data.dataType === "Currency" ? data.currency : null,
        description: data.description,
        categoryType: data.categoryType,
        // Breakdown Type is always Automatic — the Manual option was removed
        // from the UI per spec. We send it explicitly (rather than relying on
        // the server default) so the intent is visible in the payload.
        breakdownType: "Automatic",
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to save");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      onClose();
    },
  });

  function validate() {
    const errs: Partial<FormState> = {};
    if (!form.name.trim()) errs.name = "Category Name is required";
    if (!form.dataType) errs.dataType = "Data Type is required";
    // Duplicate check — case-insensitive, scoped to (name, dataType, currency).
    // Skip the row being edited so it doesn't collide with itself.
    if (form.name.trim() && form.dataType) {
      const nameLower = form.name.trim().toLowerCase();
      const effCurrency = form.dataType === "Currency" ? form.currency : null;
      const dupe = existing.find(
        (c) =>
          c.id !== editItem?.id &&
          c.name.trim().toLowerCase() === nameLower &&
          c.dataType === form.dataType &&
          (c.currency ?? null) === (effCurrency ?? null),
      );
      if (dupe) errs.name = "A category with this name and unit already exists.";
    }
    return errs;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    saveMutation.mutate(form);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Category Master</h2>
            <p className="text-sm text-gray-500 mt-0.5">{editItem ? "Edit record" : "Create new record"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {(() => {
            const drawerLocked = editItem ? !canUpdate : !canCreate;
            if (!drawerLocked) return null;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                Read-only — your role doesn&apos;t grant {editItem ? "update" : "create"} access on Category Mgmt.
              </div>
            );
          })()}
          <fieldset disabled={editItem ? !canUpdate : !canCreate} className={`space-y-5 ${(editItem ? !canUpdate : !canCreate) ? "opacity-70" : ""}`}>
          {/* Category Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Category Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={e => set("name", e.target.value)}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent ${errors.name ? "border-red-400" : "border-gray-300"}`}
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Data Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Data Type <span className="text-red-500">*</span>
            </label>
            <select
              value={form.dataType}
              onChange={e => set("dataType", e.target.value)}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white ${errors.dataType ? "border-red-400" : "border-gray-300"}`}
            >
              <option value="">Select type…</option>
              {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {errors.dataType && <p className="text-red-500 text-xs mt-1">{errors.dataType}</p>}
          </div>

          {/* Currency — only when Currency type */}
          {form.dataType === "Currency" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
              <CurrencyPicker value={form.currency} onChange={v => set("currency", v)} />
            </div>
          )}

          {/* Category Type — distribution shape across periods. */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Category Type
              </label>
              <span
                className="inline-flex items-center cursor-help text-gray-400 hover:text-gray-600"
                title={
                  `Cumulative — ${CATEGORY_TYPE_INFO.Cumulative}\n\n` +
                  `Cumulative Till Exit — ${CATEGORY_TYPE_INFO.CumulativeTillEnd}\n\n` +
                  `Standalone — ${CATEGORY_TYPE_INFO.Standalone}`
                }
              >
                <Info className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {(["Cumulative", "CumulativeTillEnd", "Standalone"] as const).map((v) => (
                <label key={v} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="categoryType"
                    value={v}
                    checked={form.categoryType === v}
                    onChange={() => set("categoryType", v)}
                    className="accent-accent-600"
                  />
                  {CATEGORY_TYPE_LABELS[v]}
                </label>
              ))}
            </div>
            <p className="text-xs italic text-gray-500 mt-1.5">
              {CATEGORY_TYPE_INFO[form.categoryType]}
            </p>
          </div>

          {/* Description */}
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
          {/* Actions */}
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

export default function CategoryMgmtPage() {
  const { canCreate, canUpdate, canDelete } = useResourcePermissions("OPSP.Categories");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [editItem, setEditItem] = useState<CategoryItem | null>(null);

  const { data, isLoading } = useQuery<{ success: boolean; data: CategoryItem[] }>({
    queryKey: ["categories", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/categories?${params}`);
      return res.json();
    },
  });

  const items: CategoryItem[] = data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => fetch(`/api/categories/${id}`, { method: "DELETE" })));
    },
    onSuccess: () => {
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const allChecked = items.length > 0 && items.every(i => selected.has(i.id));

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(items.map(i => i.id)));
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openAdd() { setEditItem(null); setPanelOpen(true); }
  function openEdit(item: CategoryItem) { setEditItem(item); setPanelOpen(true); }
  function closePanel() { setPanelOpen(false); setEditItem(null); }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">Category Mgmt</h1>
            <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400 w-44"
              />
            </div>

            {/* Bulk delete */}
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

            {canCreate && <AddButton onClick={openAdd}>Add Category</AddButton>}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4 min-h-0">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-accent-50 border-b border-gray-200">
                <th className="w-10 px-3 py-3">
                  <label
                    onClickCapture={(e) => {
                      if (!canDelete) {
                        e.preventDefault();
                        e.stopPropagation();
                        toast.error("You don't have permission to delete");
                      }
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
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Category Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-36">Data Type</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-28">Currency</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider w-60">Category Type</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Loading…</td>
                </tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    No categories yet. Click <strong>Add Category</strong> to create one.
                  </td>
                </tr>
              )}
              {items.map((item, idx) => {
                const sym = currencySymbol(item.currency);
                const isChecked = selected.has(item.id);
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${isChecked ? "bg-accent-50" : ""}`}
                    onClick={() => openEdit(item)}
                  >
                    <td className="w-10 px-3 py-3" onClick={e => {
                      e.stopPropagation();
                      if (!canDelete) {
                        toast.error("You don't have permission to delete");
                        return;
                      }
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
                    <td className="px-4 py-3 text-gray-600">{item.dataType}</td>
                    <td className="px-4 py-3">
                      {sym ? (
                        <span className="text-green-600 font-semibold">{item.currency}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <BreakdownBadges categoryType={item.categoryType} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 truncate max-w-xs">{item.description || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel */}
      {panelOpen && <CategoryPanel editItem={editItem} onClose={closePanel} canCreate={canCreate} canUpdate={canUpdate} />}
    </div>
  );
}
