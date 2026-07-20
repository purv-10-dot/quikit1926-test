"use client";

import { useState, type ReactNode } from "react";
import { HardHat, IndianRupee } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, NumberInput, SelectInput, TextAreaInput, InactiveStatusNotice,
} from "@/components/FormDrawer";
import {
  useCreateLabourCategory, useUpdateLabourCategory, useDeleteLabourCategory,
  useCreateLabourRate, useUpdateLabourRate, useDeleteLabourRate,
  useLabourCategories, useProjects,
} from "@/hooks/use-masters";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const SKILL_OPTIONS = [
  { value: "UNSKILLED", label: "Unskilled" },
  { value: "SEMI_SKILLED", label: "Semi-skilled" },
  { value: "SKILLED", label: "Skilled" },
  { value: "HIGHLY_SKILLED", label: "Highly skilled" },
];
const SKILL_LABEL: Record<string, string> = Object.fromEntries(
  SKILL_OPTIONS.map((o) => [o.value, o.label]),
);

const RATE_TYPE_OPTIONS = [
  { value: "DAILY_WAGE", label: "Daily wage" },
  { value: "HOURLY_WAGE", label: "Hourly wage" },
];
const RATE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  RATE_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

// ═══════════════════════════════════════════════════════════════════
// Categories tab
// ═══════════════════════════════════════════════════════════════════

interface CategoryRow {
  id: string;
  code: string;
  name: string;
  skillLevel: string;
  trade: string | null;
  status: string;
}

const emptyCategory = {
  code: "", name: "", skillLevel: "SKILLED", trade: "", description: "", status: "active",
};

function CategoriesTab({ tabs, statusView }: { tabs: ReactNode; statusView: StatusView }) {
  const createM = useCreateLabourCategory();
  const updateM = useUpdateLabourCategory();
  const deleteM = useDeleteLabourCategory();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCategory);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof emptyCategory>(k: K, v: (typeof emptyCategory)[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => { const n = { ...p }; delete n[k]; return n; });
  };
  const close = () => { setOpen(false); setEditingId(null); setForm(emptyCategory); setErrors({}); };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.code.trim()) errs.code = "Code is required";
    if (!form.name.trim()) errs.name = "Name is required";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      if (editingId) await updateM.mutateAsync({ id: editingId, ...form });
      else await createM.mutateAsync(form);
      close();
    } catch { /* global toast */ }
  };

  const columns: MasterColumnDef<CategoryRow>[] = [
    { key: "code", label: "Code", width: "130px" },
    { key: "name", label: "Category", render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
    { key: "skillLevel", label: "Skill Level", render: (r) => SKILL_LABEL[r.skillLevel] ?? r.skillLevel },
    { key: "trade", label: "Trade", render: (r) => r.trade ?? "—" },
    { key: "status", label: "Status", type: "status" },
  ];

  return (
    <>
      <MasterListPage<CategoryRow>
        title="Labour Categories"
        subtitle="Manage labour category master data"
        entityName="Labour Category"
        permissionUrl="/masters/labour"
        breadcrumbs={[{ label: "Masters", href: "/masters" }, { label: "Labour Master" }]}
        columns={columns}
        filters={tabs}
        infinite={{
          queryKey: "labour-categories-infinite",
          endpoint: "/api/masters/labour-categories",
          pageSize: 25,
          defaultSortBy: "code",
          defaultSortOrder: "asc",
          filters: { status: statusView },
        }}
        historyEntityType="labour-category"
        onAdd={() => { setForm(emptyCategory); setErrors({}); setEditingId(null); setOpen(true); }}
        onEdit={(item) => { setForm({ ...emptyCategory, ...item } as typeof emptyCategory); setErrors({}); setEditingId(item.id); setOpen(true); }}
        onDelete={async (item) => { await deleteM.mutateAsync(item.id); }}
        deleteConfirmMessage={(item) => (
          <>Delete labour category <span className="font-semibold text-gray-900">“{item.code}”</span>{item.name ? <> — {item.name}</> : null}?</>
        )}
        emptyIcon={<HardHat className="w-8 h-8" />}
        emptyDescription="Register trades & skill levels (Mason, Helper, Bar Bender …)."
      />

      <FormDrawer open={open} onClose={close}
        title={editingId ? "Edit Labour Category" : "Add Labour Category"}
        subtitle="Register a new labour trade / skill category"
        onSubmit={submit} loading={createM.isPending || updateM.isPending}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Category Details">
          <FormRow>
            <Field label="Code" required error={errors.code} hint="e.g. MASON-SK (cannot be changed later)">
              <TextInput value={form.code} onChange={(v) => set("code", v.toUpperCase())}
                placeholder="MASON-SK" invalid={!!errors.code} disabled={!!editingId} />
            </Field>
            <Field label="Name" required error={errors.name}>
              <TextInput value={form.name} onChange={(v) => set("name", v)} placeholder="Mason" invalid={!!errors.name} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Skill Level" required>
              <SelectInput value={form.skillLevel} onChange={(v) => set("skillLevel", v)} options={SKILL_OPTIONS} />
            </Field>
            <Field label="Trade" hint="Optional — e.g. Masonry, Shuttering">
              <TextInput value={form.trade} onChange={(v) => set("trade", v)} placeholder="Masonry" />
            </Field>
          </FormRow>
          <Field label="Description">
            <TextAreaInput value={form.description} onChange={(v) => set("description", v)} placeholder="Notes about this category…" />
          </Field>
          {editingId && (
            <Field label="Status">
              <SelectInput value={form.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} />
              {form.status === "inactive" && <InactiveStatusNotice entityName="Labour category" />}
            </Field>
          )}
        </FormSection>
      </FormDrawer>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Rates tab
// ═══════════════════════════════════════════════════════════════════

interface RateRow {
  id: string;
  categoryName: string | null;
  projectId: string | null;
  rateType: string;
  rate: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  approvalStatus: string;
  status: string;
}

const emptyRate = {
  labourCategoryId: "", projectId: "", rateType: "DAILY_WAGE",
  rate: "", effectiveFrom: "", effectiveTo: "",
};

function RatesTab({ tabs, statusView }: { tabs: ReactNode; statusView: StatusView }) {
  const createM = useCreateLabourRate();
  const updateM = useUpdateLabourRate();
  const deleteM = useDeleteLabourRate();
  const { data: catData } = useLabourCategories({ status: "active" });
  const { data: projData } = useProjects();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyRate);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const categoryOptions = (catData?.data ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }));
  const projectOptions = (projData?.data ?? []).map((p) => ({ value: p.id, label: p.name }));

  const set = <K extends keyof typeof emptyRate>(k: K, v: (typeof emptyRate)[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => { const n = { ...p }; delete n[k]; return n; });
  };
  const close = () => { setOpen(false); setEditingId(null); setForm(emptyRate); setErrors({}); };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.labourCategoryId) errs.labourCategoryId = "Category is required";
    if (!form.projectId) errs.projectId = "Project is required";
    if (!form.rate || Number(form.rate) <= 0) errs.rate = "Enter a valid rate";
    if (!form.effectiveFrom) errs.effectiveFrom = "Effective From is required";
    if (form.effectiveTo && form.effectiveFrom && form.effectiveTo < form.effectiveFrom) {
      errs.effectiveTo = "Effective To cannot be before Effective From";
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const payload = {
      labourCategoryId: form.labourCategoryId,
      projectId: form.projectId || null,
      rateType: form.rateType,
      rate: form.rate,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || null,
    };
    try {
      if (editingId) await updateM.mutateAsync({ id: editingId, ...payload });
      else await createM.mutateAsync(payload);
      close();
    } catch { /* global toast */ }
  };

  const columns: MasterColumnDef<RateRow>[] = [
    { key: "categoryName", label: "Category", render: (r) => <span className="font-medium text-gray-900">{r.categoryName ?? "—"}</span> },
    { key: "projectId", label: "Scope", render: (r) => r.projectId ? "Project-specific" : "Tenant-wide" },
    { key: "rateType", label: "Type", render: (r) => RATE_TYPE_LABEL[r.rateType] ?? r.rateType },
    { key: "rate", label: "Rate", render: (r) => `₹${r.rate}` },
    { key: "effectiveWindow", label: "Effective Window", render: (r) => `${r.effectiveFrom} → ${r.effectiveTo ?? "…"}` },
    { key: "status", label: "Status", type: "status" },
  ];

  return (
    <>
      <MasterListPage<RateRow>
        title="Labour Rates"
        subtitle="Manage labour rate master data"
        entityName="Labour Rate"
        permissionUrl="/masters/labour"
        breadcrumbs={[{ label: "Masters", href: "/masters" }, { label: "Labour Master" }]}
        columns={columns}
        filters={tabs}
        infinite={{
          queryKey: "labour-rates-infinite",
          endpoint: "/api/masters/labour-rates",
          pageSize: 25,
          defaultSortBy: "effectiveFrom",
          defaultSortOrder: "desc",
          filters: { status: statusView },
        }}
        historyEntityType="labour-rate"
        onAdd={() => { setForm(emptyRate); setErrors({}); setEditingId(null); setOpen(true); }}
        onEdit={(item) => {
          setForm({
            labourCategoryId: (item as unknown as { labourCategoryId?: string }).labourCategoryId ?? "",
            projectId: item.projectId ?? "",
            rateType: item.rateType,
            rate: item.rate,
            effectiveFrom: item.effectiveFrom,
            effectiveTo: item.effectiveTo ?? "",
          });
          setErrors({}); setEditingId(item.id); setOpen(true);
        }}
        onDelete={async (item) => { await deleteM.mutateAsync(item.id); }}
        deleteConfirmMessage={(item) => (
          <>Delete this <span className="font-semibold text-gray-900">{item.categoryName ?? "labour"}</span> rate?</>
        )}
        emptyIcon={<IndianRupee className="w-8 h-8" />}
        emptyDescription="Add effective-dated wage rates per category (tenant-wide or per project)."
      />

      <FormDrawer open={open} onClose={close}
        title={editingId ? "Edit Labour Rate" : "Add Labour Rate"}
        subtitle="Rates apply immediately once saved"
        onSubmit={submit} loading={createM.isPending || updateM.isPending}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Rate Details">
          <Field label="Labour Category" required error={errors.labourCategoryId}>
            <SelectInput value={form.labourCategoryId} onChange={(v) => set("labourCategoryId", v)}
              options={categoryOptions} placeholder="Select category" invalid={!!errors.labourCategoryId} />
          </Field>
          <Field label="Project" required error={errors.projectId} hint="Select the project this rate applies to">
            <SelectInput value={form.projectId} onChange={(v) => set("projectId", v)}
              options={projectOptions} placeholder="Select project" invalid={!!errors.projectId} />
          </Field>
          <FormRow>
            <Field label="Rate Type" required>
              <SelectInput value={form.rateType} onChange={(v) => set("rateType", v)} options={RATE_TYPE_OPTIONS} />
            </Field>
            <Field label="Rate (₹)" required error={errors.rate}>
              <NumberInput value={form.rate} onChange={(v) => set("rate", v)} placeholder="0.00" min={0} step="0.01" invalid={!!errors.rate} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Effective From" required error={errors.effectiveFrom}>
              <TextInput type="date" value={form.effectiveFrom} onChange={(v) => set("effectiveFrom", v)} invalid={!!errors.effectiveFrom} />
            </Field>
            <Field label="Effective To" error={errors.effectiveTo} hint="Optional — leave blank for an open-ended window">
              <TextInput type="date" value={form.effectiveTo} onChange={(v) => set("effectiveTo", v)} invalid={!!errors.effectiveTo} />
            </Field>
          </FormRow>
        </FormSection>
      </FormDrawer>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Page shell — one page, two tabs
// ═══════════════════════════════════════════════════════════════════

type StatusView = "active" | "inactive" | "all";

function LabourTabs({
  tab, onChange,
}: { tab: "categories" | "rates"; onChange: (t: "categories" | "rates") => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {(["categories", "rates"] as const).map((t) => (
        <button key={t} type="button" onClick={() => onChange(t)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === t ? "bg-white text-orange-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}>
          {t === "categories" ? "Categories" : "Rates"}
        </button>
      ))}
    </div>
  );
}

function StatusPills({
  value, onChange,
}: { value: StatusView; onChange: (v: StatusView) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {(["active", "inactive", "all"] as const).map((s) => (
        <button key={s} type="button" onClick={() => onChange(s)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
            value === s ? "bg-white text-orange-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}>
          {s}
        </button>
      ))}
    </div>
  );
}

export default function LabourMasterPage() {
  const [tab, setTab] = useState<"categories" | "rates">("categories");
  const [statusView, setStatusView] = useState<StatusView>("active");

  // Section tabs + status filter on ONE row, rendered in the page toolbar.
  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <LabourTabs tab={tab} onChange={setTab} />
      <StatusPills value={statusView} onChange={setStatusView} />
    </div>
  );

  return tab === "categories"
    ? <CategoriesTab tabs={toolbar} statusView={statusView} />
    : <RatesTab tabs={toolbar} statusView={statusView} />;
}
