"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Package, Plus, AlertTriangle, Tags } from "lucide-react";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { FilterBar, FilterDivider, FilterSearch } from "@/components/hrms/ui/filter-bar";
import { AssetTabs } from "./_components/asset-tabs";
import { PageHeader } from "@/components/hrms/ui/page-header";

type Category = "Laptop" | "Desktop" | "Mobile" | "Tablet" | "IdCard" | "AccessCard" | "Furniture" | "Vehicle" | "SoftwareLicense" | "Peripheral" | "AssetOther" | string;
type Status = "Available" | "Assigned" | "InRepair" | "Retired" | "AssetLost";
type Condition = "New" | "Good" | "Fair" | "Poor";

interface Asset {
  id: string; assetCode: string; name: string; category: Category; quantity: number; serialNumber: string | null;
  brand: string | null; model: string | null; status: Status; condition: Condition; location: string | null;
  assignments: Array<{ id: string; employeeId: string; assignedAt: string; expectedReturnDate: string | null }>;
  assignedCount?: number;
  availableCount?: number;
}

interface OverdueItem {
  id: string; employeeId: string; assignedAt: string; expectedReturnDate: string;
  daysOverdue: number; asset: { id: string; assetCode: string; name: string };
}

const DEFAULT_CATEGORIES: string[] = ["Laptop", "Desktop", "Mobile", "Tablet", "IdCard", "AccessCard", "Furniture", "Vehicle", "SoftwareLicense", "Peripheral", "AssetOther"];
type Availability = "" | "available" | "partial" | "full";

export default function AssetInventoryPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ category: "", availability: "" as Availability, search: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem("hrms.asset.customCategories");
    return stored ? JSON.parse(stored) : [];
  });
  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories];

  const [form, setForm] = useState({
    assetCode: "", name: "", category: "Laptop" as Category, serialNumber: "", brand: "", model: "",
    purchaseDate: "", purchasePrice: null as number | null, warrantyExpiry: "", location: "", condition: 100, notes: "",
    quantity: 1, trackIndividually: false,
  });

  const conditionLabel = (v: number): Condition => v <= 25 ? "Poor" : v <= 50 ? "Fair" : v <= 75 ? "Good" : "New";

  const qs = new URLSearchParams();
  qs.set("limit", "100");
  if (filters.category) qs.set("category", filters.category);
  if (filters.search) qs.set("search", filters.search);

  const { data, isLoading } = useQuery({
    queryKey: ["assets", filters],
    queryFn: () => api.get<Asset[]>(`/api/v1/hrms/assets?${qs.toString()}`),
  });

  const { data: overdue } = useQuery({
    queryKey: ["assets", "overdue"],
    queryFn: () => api.get<OverdueItem[]>("/api/v1/hrms/assets/overdue"),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/assets", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); setShowCreate(false); },
  });

  const allAssets = data?.data ?? [];
  const assets = allAssets.filter((a) => {
    if (!filters.availability) return true;
    const total = a.quantity ?? 1;
    const assigned = a.assignedCount ?? a.assignments.length;
    if (filters.availability === "available") return assigned === 0;
    if (filters.availability === "partial") return assigned > 0 && assigned < total;
    if (filters.availability === "full") return assigned >= total;
    return true;
  });
  const overdueList = overdue?.data ?? [];

  return (
    <div className="w-full px-6 py-6">
      <PageHeader
        icon={<Package size={28} className="text-[#3b82f6]" />}
        title="Asset inventory"
        subtitle="Track laptops, IDs, licenses and more."
        actions={
          <>
            <button onClick={() => setShowCategoryModal(true)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
              <Tags size={14} /> Categories
            </button>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary">
              <Plus size={14} /> Add asset
            </button>
          </>
        }
      />
      <div className="mb-5"><AssetTabs /></div>

      {overdueList.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-2">
            <AlertTriangle size={14} /> {overdueList.length} overdue return{overdueList.length > 1 ? "s" : ""}
          </div>
          <div className="space-y-1">
            {overdueList.slice(0, 3).map((o) => (
              <Link key={o.id} href={`/assets/${o.asset.id}`} className="block text-xs text-red-900 hover:underline">
                {o.asset.assetCode} — {o.asset.name} • {o.daysOverdue} days overdue • assigned to {o.employeeId}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <FilterBar>
          <Select
            value={filters.category}
            onChange={(v) => setFilters({ ...filters, category: v })}
            placeholder="All categories"
            options={[{ value: "", label: "All categories" }, ...allCategories.map((c) => ({ value: c, label: c }))]}
          />
          <Select
            value={filters.availability}
            onChange={(v) => setFilters({ ...filters, availability: v as Availability })}
            placeholder="All availability"
            options={[
              { value: "", label: "All availability" },
              { value: "available", label: "Fully available" },
              { value: "partial", label: "Partially assigned" },
              { value: "full", label: "Fully assigned" },
            ]}
          />
          <FilterDivider />
          <FilterSearch
            value={filters.search}
            onChange={(v) => setFilters({ ...filters, search: v })}
            placeholder="Search assets..."
          />
        </FilterBar>
      </div>

      {isLoading ? <SkeletonTable rows={6} cols={5} /> : assets.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-14 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
            <Package size={24} className="text-[#3b82f6]" />
          </div>
          <h3 className="text-base font-bold text-gray-900">No assets yet</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            Track laptops, ID cards, software licenses and more. Add your first asset to start managing inventory.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] text-white rounded-lg text-sm font-semibold shadow-sm"
          >
            <Plus size={14} /> Add asset
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Code</th>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Category</th>
                <th className="text-left px-4 py-2">Total</th>
                <th className="text-left px-4 py-2">Assigned</th>
                <th className="text-left px-4 py-2">Free</th>
                <th className="text-left px-4 py-2">Serial</th>
                <th className="text-left px-4 py-2">Assignee</th>
                <th className="text-left px-4 py-2">Condition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assets.map((a, i) => (
                <tr key={a.id} className="row-stagger hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-2 font-mono text-xs">
                    <Link href={`/assets/${a.id}`} className="text-[#3b82f6] hover:underline">{a.assetCode}</Link>
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-900">{a.name}
                    {a.brand && <div className="text-xs text-gray-400">{a.brand} {a.model}</div>}</td>
                  <td className="px-4 py-2"><span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">{a.category}</span></td>
                  <td className="px-4 py-2 text-xs font-semibold text-gray-900">{a.quantity ?? 1}</td>
                  <td className="px-4 py-2 text-xs font-semibold text-blue-600">{a.assignedCount ?? a.assignments.length}</td>
                  <td className="px-4 py-2 text-xs font-semibold text-green-600">{a.availableCount ?? Math.max(0, (a.quantity ?? 1) - (a.assignedCount ?? a.assignments.length))}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-600">{a.serialNumber ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-600">
                    {a.assignments.length === 0 ? "—" :
                     a.assignments.length === 1 ? a.assignments[0].employeeId :
                     `${a.assignments.length} employees`}
                  </td>
                  <td className="px-4 py-2 text-gray-700">{a.condition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Category Management Modal */}
      <Modal open={showCategoryModal} onClose={() => setShowCategoryModal(false)} title="Manage Categories">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="New category name..."
              className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newCategory.trim()) {
                  const cat = newCategory.trim();
                  if (!allCategories.includes(cat)) {
                    const updated = [...customCategories, cat];
                    setCustomCategories(updated);
                    localStorage.setItem("hrms.asset.customCategories", JSON.stringify(updated));
                  }
                  setNewCategory("");
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                const cat = newCategory.trim();
                if (cat && !allCategories.includes(cat)) {
                  const updated = [...customCategories, cat];
                  setCustomCategories(updated);
                  localStorage.setItem("hrms.asset.customCategories", JSON.stringify(updated));
                }
                setNewCategory("");
              }}
              disabled={!newCategory.trim()}
              className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50"
            >
              Add
            </button>
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Default Categories</p>
            {DEFAULT_CATEGORIES.map((c) => (
              <div key={c} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700">
                <span>{c}</span>
                <span className="text-xs text-gray-400">Built-in</span>
              </div>
            ))}
            {customCategories.length > 0 && (
              <>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-4 mb-2">Custom Categories</p>
                {customCategories.map((c) => (
                  <div key={c} className="flex items-center justify-between px-3 py-2 bg-blue-50 rounded-lg text-sm text-gray-700">
                    <span>{c}</span>
                    <button
                      onClick={() => {
                        const updated = customCategories.filter((x) => x !== c);
                        setCustomCategories(updated);
                        localStorage.setItem("hrms.asset.customCategories", JSON.stringify(updated));
                      }}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Asset">
        <form onSubmit={(e) => {
          e.preventDefault();
          createMut.mutate({
            assetCode: form.assetCode,
            name: form.name,
            category: form.category,
            serialNumber: form.serialNumber || undefined,
            brand: form.brand || undefined,
            model: form.model || undefined,
            purchaseDate: form.purchaseDate || undefined,
            purchasePrice: form.purchasePrice ?? undefined,
            warrantyExpiry: form.warrantyExpiry || undefined,
            location: form.location || undefined,
            condition: conditionLabel(form.condition),
            notes: form.notes || undefined,
            quantity: form.quantity,
            trackIndividually: form.trackIndividually,
          });
        }} className="space-y-5">
          {/* Section: Basic Info */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-bold text-gray-500 uppercase tracking-wider">Basic Information</legend>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Asset Name <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" placeholder="MacBook Pro 14-inch" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input type="number" min={1} max={100} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
                {form.quantity > 1 && (
                  <p className="text-xs text-blue-500 mt-0.5">
                    {form.trackIndividually ? `${form.quantity} separate units (1 row each)` : `1 row, qty=${form.quantity}`}
                  </p>
                )}
              </div>
            </div>
            {form.quantity > 1 && (
              <label className="flex items-start gap-2 text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <input type="checkbox" className="mt-0.5"
                  checked={form.trackIndividually}
                  onChange={(e) => setForm({ ...form, trackIndividually: e.target.checked })} />
                <span>
                  <span className="font-medium text-gray-800">Track each unit individually</span>
                  <span className="block text-xs text-gray-500">Recommended for laptops, phones, vehicles. Creates {form.quantity} rows with codes {form.assetCode || "CODE"}-01 to {form.assetCode || "CODE"}-{String(form.quantity).padStart(2, "0")}.</span>
                </span>
              </label>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asset Code <span className="text-red-500">*</span></label>
                <input required value={form.assetCode} onChange={(e) => setForm({ ...form, assetCode: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono" placeholder="LAP-001" />
                {form.quantity > 1 && form.trackIndividually && <p className="text-xs text-gray-400 mt-0.5">{form.assetCode}-01 to {form.assetCode}-{String(form.quantity).padStart(2, "0")}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <Select
                  value={form.category}
                  onChange={(v) => setForm({ ...form, category: v as Category })}
                  options={allCategories.map((c) => ({ value: c, label: c }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                <input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono" placeholder="SN-XXXXXX" />
              </div>
            </div>
          </fieldset>

          {/* Section: Device Details */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-bold text-gray-500 uppercase tracking-wider">Device Details</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" placeholder="Apple" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" placeholder="MBP M3 Pro" />
              </div>
            </div>
          </fieldset>

          {/* Section: Purchase & Warranty */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-bold text-gray-500 uppercase tracking-wider">Purchase & Warranty</legend>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price</label>
                <NumberInput value={form.purchasePrice} onChange={(v) => setForm({ ...form, purchasePrice: v })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Warranty Expiry</label>
                <input type="date" value={form.warrantyExpiry} onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          </fieldset>

          {/* Section: Condition */}
          <fieldset>
            <legend className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Condition — {form.condition}%</legend>
            <div className="relative px-2 pt-2 pb-3 bg-gray-50 rounded-lg">
              <div className="absolute top-[18px] left-4 right-4 h-3 rounded-full bg-gradient-to-r from-red-300 via-yellow-200 via-60% to-green-300" />
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: Number(e.target.value) })}
                className="relative w-full h-3 appearance-none bg-transparent cursor-pointer z-10
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2
                  [&::-webkit-slider-thumb]:border-[#3b82f6] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab
                  [&::-webkit-slider-thumb]:active:cursor-grabbing [&::-webkit-slider-thumb]:hover:scale-110
                  [&::-webkit-slider-thumb]:transition-transform
                  [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#3b82f6]
                  [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-grab
                  [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-1.5 px-1">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>
          </fieldset>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Any additional notes..." />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-500">{form.quantity} asset{form.quantity > 1 ? "s" : ""} will be added</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={createMut.isPending} className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50">
                {createMut.isPending ? "Adding..." : `Add ${form.quantity > 1 ? form.quantity + " Assets" : "Asset"}`}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
