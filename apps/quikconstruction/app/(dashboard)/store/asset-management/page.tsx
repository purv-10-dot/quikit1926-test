"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton, StatusChip } from "@/components/PageShell";
import { FormDrawer } from "@/components/FormDrawer";

// ─── Types ─────────────────────────────────────────────────────────

type AssetCategory = {
  id: string;
  name: string;
  parentId: string | null;
  parentName?: string | null;
  active: boolean;
};

type Asset = {
  id: string;
  assetCode: string;
  name: string;
  categoryId: string;
  categoryName?: string;
  model: string | null;
  purchaseDate: string;
  cost: number;
  status: string;
  requiresApproval: boolean;
};

type Issuance = {
  id: string;
  issuanceNumber: string;
  assetId: string;
  assetCode?: string;
  assetName?: string;
  issuedTo: string;
  issueDate: string;
  expectedReturn: string | null;
  returnable: boolean;
  notes: string | null;
  status: string;
  returnedAt: string | null;
};

// ─── Hooks ─────────────────────────────────────────────────────────

const todayIso = () => new Date().toISOString().slice(0, 10);

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function jsend<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json as T;
}

// ─── Page ──────────────────────────────────────────────────────────

const TABS = [
  { key: "register", label: "Asset Register" },
  { key: "categories", label: "Categories" },
  { key: "issuance", label: "Issuance & Returns" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AssetManagementPage() {
  const [tab, setTab] = useState<TabKey>("register");
  const [registerOpen, setRegisterOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Asset Management"
        subtitle="Lifecycle management for company assets, categories, and issuances."
        breadcrumbs={[{ label: "Store", href: "/store" }, { label: "Asset Management" }]}
        actions={
          tab === "register" ? (
            <PrimaryButton onClick={() => setRegisterOpen(true)}>
              <Plus className="w-4 h-4" /> Register Asset
            </PrimaryButton>
          ) : null
        }
      />
      <PageContainer>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <div className="inline-flex gap-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tab === t.key
                      ? "bg-orange-50 text-orange-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5">
            {tab === "register" && <AssetRegisterTab />}
            {tab === "categories" && <CategoriesTab />}
            {tab === "issuance" && <IssuanceTab />}
          </div>
        </div>
      </PageContainer>

      <RegisterAssetDrawer
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
      />
    </>
  );
}

// ─── Asset Register tab ────────────────────────────────────────────

function AssetRegisterTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data } = useQuery({
    queryKey: ["asset-mgmt", "assets", search],
    queryFn: () =>
      jget<{ data: Asset[] }>(
        `/api/store/asset-mgmt/assets${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      ),
  });
  const rows = data?.data ?? [];

  const remove = useMutation({
    mutationFn: (id: string) => jsend(`/api/store/asset-mgmt/assets/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-mgmt", "assets"] }),
    onError: (e: any) => alert(e?.message ?? "Delete failed"),
  });

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <div className="relative">
          <svg
            className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" />
          </svg>
          <input
            type="text"
            placeholder="Search assets by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-md w-72 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
          />
        </div>
      </div>

      <div className="border border-slate-100 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Asset ID</th>
              <th className="px-4 py-2.5 font-semibold">Name &amp; Model</th>
              <th className="px-4 py-2.5 font-semibold">Category</th>
              <th className="px-4 py-2.5 font-semibold">Cost</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                  No assets found matching your criteria.
                </td>
              </tr>
            ) : (
              rows.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{a.assetCode}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{a.name}</div>
                    {a.model && <div className="text-xs text-slate-500">{a.model}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{a.categoryName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-700">
                    ₹ {Number(a.cost ?? 0).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-2.5"><StatusChip status={a.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Remove asset ${a.assetCode}?`)) remove.mutate(a.id);
                      }}
                      className="p-1 rounded hover:bg-rose-50 text-rose-600"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Register New Asset (slide-over drawer) ────────────────────────

function RegisterAssetDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  // Auto-generated asset code — random 5-digit suffix matches the
  // "AST-03613" placeholder pattern. User can overwrite.
  const [assetCode, setAssetCode] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [model, setModel] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [cost, setCost] = useState("");

  // Reseed defaults each time the drawer opens so a previously-cancelled
  // form doesn't leak stale values into the next session.
  useEffect(() => {
    if (open) {
      setAssetCode(`AST-${Math.floor(10000 + Math.random() * 90000)}`);
      setName("");
      setCategoryId("");
      setModel("");
      setPurchaseDate(todayIso());
      setCost("");
    }
  }, [open]);

  const { data: catData } = useQuery({
    queryKey: ["asset-mgmt", "categories"],
    queryFn: () => jget<{ data: AssetCategory[] }>(`/api/store/asset-mgmt/categories`),
    enabled: open,
  });
  const categories = (catData?.data ?? []).filter((c) => c.active);

  const create = useMutation({
    mutationFn: (body: any) => jsend(`/api/store/asset-mgmt/assets`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-mgmt", "assets"] });
      onClose();
    },
    onError: (e: any) => alert(e?.message ?? "Create failed"),
  });

  const submit = () => {
    create.mutate({
      assetCode,
      name,
      categoryId,
      model,
      purchaseDate,
      cost: cost === "" ? 0 : Number(cost),
    });
  };

  const numericCost = Number(cost);
  const overThreshold = Number.isFinite(numericCost) && numericCost > 50000;

  return (
    <FormDrawer
      open={open}
      onClose={onClose}
      title="Register New Asset"
      subtitle="Enter asset details. Cost > ₹50,000 requires admin approval."
      width="xl"
      submitLabel={create.isPending ? "Saving..." : "Register Asset"}
      loading={create.isPending}
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <Field label="Asset Code / ID" required>
          <input
            type="text"
            value={assetCode}
            onChange={(e) => setAssetCode(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Asset Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Category" required>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputClass}
          >
            <option value="">-- Select Category --</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model / Make">
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Purchase Date" required>
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Cost (₹)" required>
          <input
            type="number"
            min="0"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      {overThreshold && (
        <div className="mt-4 p-2.5 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
          Cost exceeds ₹50,000 — this asset will be created in&nbsp;
          <span className="font-semibold">Pending Approval</span>.
        </div>
      )}

      {categories.length === 0 && (
        <p className="mt-4 text-xs text-slate-500">
          No active categories yet — add one in the <b>Categories</b> tab first.
        </p>
      )}
    </FormDrawer>
  );
}

// ─── Categories tab ────────────────────────────────────────────────

function CategoriesTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["asset-mgmt", "categories"],
    queryFn: () => jget<{ data: AssetCategory[] }>(`/api/store/asset-mgmt/categories`),
  });
  const rows = data?.data ?? [];

  const remove = useMutation({
    mutationFn: (id: string) => jsend(`/api/store/asset-mgmt/categories/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-mgmt", "categories"] }),
    onError: (e: any) => alert(e?.message ?? "Delete failed"),
  });
  const toggle = useMutation({
    mutationFn: (c: AssetCategory) =>
      jsend(`/api/store/asset-mgmt/categories/${c.id}`, "PATCH", { active: !c.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-mgmt", "categories"] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Asset Categories</h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-50 hover:bg-orange-100 text-orange-700 text-sm font-medium ring-1 ring-orange-200"
        >
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>

      <div className="border border-slate-100 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Category Name</th>
              <th className="px-4 py-2.5 font-semibold">Parent Category</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">
                  No categories found.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-2.5 text-slate-700">{c.parentName ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggle.mutate(c)}
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        c.active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                    >
                      {c.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Remove category "${c.name}"?`)) remove.mutate(c.id);
                      }}
                      className="p-1 rounded hover:bg-rose-50 text-rose-600"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AddCategoryDrawer open={open} categories={rows} onClose={() => setOpen(false)} />
    </div>
  );
}

function AddCategoryDrawer({
  open,
  categories,
  onClose,
}: {
  open: boolean;
  categories: AssetCategory[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName("");
      setParentId("");
      setActive(true);
    }
  }, [open]);

  const create = useMutation({
    mutationFn: (body: any) => jsend(`/api/store/asset-mgmt/categories`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-mgmt", "categories"] });
      onClose();
    },
    onError: (e: any) => alert(e?.message ?? "Create failed"),
  });

  return (
    <FormDrawer
      open={open}
      onClose={onClose}
      title="Add Category"
      subtitle="Group assets under a logical category."
      width="md"
      submitLabel={create.isPending ? "Saving..." : "Save Category"}
      loading={create.isPending}
      onSubmit={() =>
        create.mutate({ name, parentId: parentId || null, active })
      }
    >
      <div className="space-y-4">
        <Field label="Category Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            autoFocus
          />
        </Field>
        <Field label="Parent Category">
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={inputClass}
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded text-orange-600"
          />
          Active
        </label>
      </div>
    </FormDrawer>
  );
}

// ─── Issuance & Returns tab ────────────────────────────────────────

function IssuanceTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["asset-mgmt", "issuances"],
    queryFn: () => jget<{ data: Issuance[] }>(`/api/store/asset-mgmt/issuances`),
  });
  const rows = data?.data ?? [];

  const markReturned = useMutation({
    mutationFn: (id: string) =>
      jsend(`/api/store/asset-mgmt/issuances/${id}`, "PATCH", { action: "return" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-mgmt", "issuances"] }),
    onError: (e: any) => alert(e?.message ?? "Action failed"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Asset Issuance &amp; Tracking</h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-50 hover:bg-orange-100 text-orange-700 text-sm font-medium ring-1 ring-orange-200"
        >
          <Plus className="w-4 h-4" /> Issue Asset
        </button>
      </div>

      <div className="border border-slate-100 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Issuance ID</th>
              <th className="px-4 py-2.5 font-semibold">Asset</th>
              <th className="px-4 py-2.5 font-semibold">Issued To</th>
              <th className="px-4 py-2.5 font-semibold">Issue Date</th>
              <th className="px-4 py-2.5 font-semibold">Expected Return</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                  No issuances found.
                </td>
              </tr>
            ) : (
              rows.map((i) => (
                <tr key={i.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{i.issuanceNumber}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{i.assetName}</div>
                    <div className="text-xs text-slate-500">{i.assetCode}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{i.issuedTo}</td>
                  <td className="px-4 py-2.5 text-slate-700">{i.issueDate || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-700">{i.expectedReturn ?? "—"}</td>
                  <td className="px-4 py-2.5"><StatusChip status={i.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    {i.status === "issued" && i.returnable && (
                      <button
                        type="button"
                        onClick={() => markReturned.mutate(i.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                        title="Mark Returned"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Return
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <IssueAssetDrawer open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function IssueAssetDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [assetId, setAssetId] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [issueDate, setIssueDate] = useState(todayIso());
  const [expectedReturn, setExpectedReturn] = useState("");
  const [returnable, setReturnable] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setAssetId("");
      setIssuedTo("");
      setIssueDate(todayIso());
      setExpectedReturn("");
      setReturnable(true);
      setNotes("");
    }
  }, [open]);

  const { data: assetData } = useQuery({
    queryKey: ["asset-mgmt", "assets"],
    queryFn: () => jget<{ data: Asset[] }>(`/api/store/asset-mgmt/assets`),
    enabled: open,
  });
  const { data: issData } = useQuery({
    queryKey: ["asset-mgmt", "issuances"],
    queryFn: () => jget<{ data: Issuance[] }>(`/api/store/asset-mgmt/issuances`),
    enabled: open,
  });
  // Hide assets that are already issued out and not returned.
  const issuedSet = useMemo(
    () =>
      new Set(
        (issData?.data ?? [])
          .filter((i) => i.status === "issued")
          .map((i) => i.assetId),
      ),
    [issData],
  );
  const assets = (assetData?.data ?? []).filter((a) => !issuedSet.has(a.id));

  const create = useMutation({
    mutationFn: (body: any) => jsend(`/api/store/asset-mgmt/issuances`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-mgmt", "issuances"] });
      onClose();
    },
    onError: (e: any) => alert(e?.message ?? "Create failed"),
  });

  return (
    <FormDrawer
      open={open}
      onClose={onClose}
      title="Issue Asset"
      subtitle="Issue an asset to a user or department."
      width="md"
      submitLabel={create.isPending ? "Saving..." : "Save Issuance"}
      loading={create.isPending}
      onSubmit={() =>
        create.mutate({
          assetId,
          issuedTo,
          issueDate,
          expectedReturn: returnable ? expectedReturn || null : null,
          returnable,
          notes,
        })
      }
    >
      <div className="space-y-4">
        <Field label="Asset" required>
          <select
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            className={inputClass}
          >
            <option value="">-- Select Asset --</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.assetCode} — {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Issued To" required>
          <input
            type="text"
            placeholder="User or Department"
            value={issuedTo}
            onChange={(e) => setIssuedTo(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Issue Date" required>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Expected Return (If Returnable)">
            <input
              type="date"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
              disabled={!returnable}
              className={`${inputClass} ${!returnable ? "bg-slate-50 text-slate-400" : ""}`}
            />
          </Field>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={returnable}
            onChange={(e) => setReturnable(e.target.checked)}
            className="rounded text-orange-600"
          />
          Returnable Asset
        </label>
        <Field label="Notes">
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
    </FormDrawer>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────

const inputClass =
  "w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

