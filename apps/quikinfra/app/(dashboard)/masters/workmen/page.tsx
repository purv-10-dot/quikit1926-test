"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, NumberInput, SelectInput, MultiSelectInput, CheckboxInput, InactiveStatusNotice,
} from "@/components/FormDrawer";
import {
  useCreateWorkman, useUpdateWorkman, useDeleteWorkman,
  useLabourCategories, useContractors, useProjects,
} from "@/hooks/use-masters";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];
const ENGAGEMENT_OPTIONS = [
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "DEPARTMENTAL", label: "Departmental" },
];
const ENGAGEMENT_LABEL: Record<string, string> = Object.fromEntries(
  ENGAGEMENT_OPTIONS.map((o) => [o.value, o.label]),
);
const GENDER_OPTIONS = [
  { value: "", label: "—" },
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "O", label: "Other" },
];
const ID_PROOF_OPTIONS = [
  { value: "", label: "—" },
  { value: "AADHAAR", label: "Aadhaar" },
  { value: "VOTER_ID", label: "Voter ID" },
  { value: "DL", label: "Driving Licence" },
  { value: "OTHER", label: "Other" },
];

interface WorkmanRow {
  id: string;
  workmanCode: string;
  fullName: string;
  categoryName: string | null;
  engagementType: string;
  phone: string | null;
  status: string;
}

const emptyForm = {
  fullName: "", labourCategoryId: "", engagementType: "CONTRACTOR", contractorId: "",
  phone: "", gender: "", dailyWage: "", idProofType: "", idProofLast4: "",
  joiningDate: "", exitDate: "", projectIds: [] as string[], safetyInductionDone: false,
  status: "active",
};

// PII: only the last 4 chars of an ID number are ever stored/sent.
function maskLast4(v: string): string {
  const s = v.replace(/\s+/g, "");
  return s.length > 4 ? s.slice(-4) : s;
}

export default function WorkmenPage() {
  const createM = useCreateWorkman();
  const updateM = useUpdateWorkman();
  const deleteM = useDeleteWorkman();
  const { data: catData } = useLabourCategories({ status: "active" });
  const { data: contractorData } = useContractors();
  const { data: projData } = useProjects();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const categoryOptions = (catData?.data ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }));
  const contractorOptions = (contractorData?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const projectOptions = (projData?.data ?? []).map((p) => ({ value: p.id, label: p.name }));

  const set = <K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => { const n = { ...p }; delete n[k]; return n; });
  };
  const close = () => { setOpen(false); setEditingId(null); setForm(emptyForm); setErrors({}); };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.fullName.trim()) errs.fullName = "Full name is required";
    if (!form.labourCategoryId) errs.labourCategoryId = "Category is required";
    if (form.engagementType === "CONTRACTOR" && !form.contractorId) errs.contractorId = "Contractor is required for contractor workmen";
    if (form.engagementType === "DEPARTMENTAL" && form.contractorId) errs.contractorId = "Departmental workmen must not have a contractor";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const payload = {
      fullName: form.fullName,
      labourCategoryId: form.labourCategoryId,
      engagementType: form.engagementType,
      contractorId: form.engagementType === "CONTRACTOR" ? form.contractorId : null,
      phone: form.phone || null,
      gender: form.gender || null,
      dailyWage: form.dailyWage || null,
      idProofType: form.idProofType || null,
      idProofLast4: form.idProofLast4 || null,
      joiningDate: form.joiningDate || null,
      exitDate: form.exitDate || null,
      projectIds: form.projectIds,
      safetyInductionDone: form.safetyInductionDone,
      status: form.status,
    };
    try {
      if (editingId) await updateM.mutateAsync({ id: editingId, ...payload });
      else await createM.mutateAsync(payload);
      close();
    } catch { /* global toast */ }
  };

  const columns: MasterColumnDef<WorkmanRow>[] = [
    { key: "workmanCode", label: "Code", width: "120px" },
    { key: "fullName", label: "Name", render: (r) => <span className="font-medium text-gray-900">{r.fullName}</span> },
    { key: "categoryName", label: "Category", render: (r) => r.categoryName ?? "—" },
    { key: "engagementType", label: "Engagement", render: (r) => ENGAGEMENT_LABEL[r.engagementType] ?? r.engagementType },
    { key: "phone", label: "Phone", render: (r) => r.phone ?? "—" },
    { key: "status", label: "Status", type: "status" },
  ];

  const isContractor = form.engagementType === "CONTRACTOR";

  return (
    <>
      <MasterListPage<WorkmanRow>
        title="Workmen"
        subtitle="Manage individual workman records"
        entityName="Workman"
        permissionUrl="/masters/workmen"
        columns={columns}
        showStatusTabs
        infinite={{
          queryKey: "workmen-infinite",
          endpoint: "/api/masters/workmen",
          pageSize: 25,
          defaultSortBy: "workmanCode",
          defaultSortOrder: "asc",
        }}
        historyEntityType="workman"
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setOpen(true); }}
        onEdit={(item) => {
          const w = item as unknown as Record<string, unknown>;
          setForm({
            ...emptyForm,
            fullName: String(w.fullName ?? ""),
            labourCategoryId: String(w.labourCategoryId ?? ""),
            engagementType: String(w.engagementType ?? "CONTRACTOR"),
            contractorId: String(w.contractorId ?? ""),
            phone: String(w.phone ?? ""),
            gender: String(w.gender ?? ""),
            dailyWage: w.dailyWage != null ? String(w.dailyWage) : "",
            idProofType: String(w.idProofType ?? ""),
            idProofLast4: String(w.idProofLast4 ?? ""),
            joiningDate: String(w.joiningDate ?? ""),
            exitDate: String(w.exitDate ?? ""),
            projectIds: Array.isArray(w.projectIds) ? (w.projectIds as string[]) : [],
            safetyInductionDone: !!w.safetyInductionDone,
            status: String(w.status ?? "active"),
          });
          setErrors({}); setEditingId(item.id); setOpen(true);
        }}
        onDelete={async (item) => { await deleteM.mutateAsync(item.id); }}
        deleteConfirmMessage={(item) => (
          <>Delete workman <span className="font-semibold text-gray-900">“{item.workmanCode}”</span>{item.fullName ? <> — {item.fullName}</> : null}?</>
        )}
        emptyIcon={<Users className="w-8 h-8" />}
        emptyDescription="Register individual workers under a contractor or as departmental labour."
      />

      <FormDrawer open={open} onClose={close}
        title={editingId ? "Edit Workman" : "Add Workman"}
        subtitle="Register an individual worker"
        onSubmit={submit} loading={createM.isPending || updateM.isPending}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Identity">
          <FormRow>
            <Field label="Full Name" required error={errors.fullName}>
              <TextInput value={form.fullName} onChange={(v) => set("fullName", v)} placeholder="Ramesh Kumar" invalid={!!errors.fullName} />
            </Field>
            <Field label="Phone">
              <TextInput value={form.phone} onChange={(v) => set("phone", v)} placeholder="98xxxxxxxx" />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Labour Category" required error={errors.labourCategoryId}>
              <SelectInput value={form.labourCategoryId} onChange={(v) => set("labourCategoryId", v)}
                options={categoryOptions} placeholder="Select category" invalid={!!errors.labourCategoryId} />
            </Field>
            <Field label="Gender">
              <SelectInput value={form.gender} onChange={(v) => set("gender", v)} options={GENDER_OPTIONS} />
            </Field>
          </FormRow>
        </FormSection>

        <FormSection title="Engagement">
          <FormRow>
            <Field label="Engagement Type" required>
              <SelectInput value={form.engagementType} onChange={(v) => { set("engagementType", v); if (v === "DEPARTMENTAL") set("contractorId", ""); }} options={ENGAGEMENT_OPTIONS} />
            </Field>
            {isContractor && (
              <Field label="Contractor" required error={errors.contractorId}>
                <SelectInput value={form.contractorId} onChange={(v) => set("contractorId", v)}
                  options={contractorOptions} placeholder="Select contractor" invalid={!!errors.contractorId} />
              </Field>
            )}
          </FormRow>
          <FormRow>
            <Field label="Daily Wage (₹)" hint="Optional override — else resolved from Labour Rate">
              <NumberInput value={form.dailyWage} onChange={(v) => set("dailyWage", v)} placeholder="0.00" min={0} step="0.01" />
            </Field>
            <Field label="Inducted Projects">
              <MultiSelectInput values={form.projectIds} onChange={(v) => set("projectIds", v)} options={projectOptions} placeholder="Select projects" />
            </Field>
          </FormRow>
        </FormSection>

        <FormSection title="Documents & Compliance">
          <FormRow>
            <Field label="ID Proof Type">
              <SelectInput value={form.idProofType} onChange={(v) => set("idProofType", v)} options={ID_PROOF_OPTIONS} />
            </Field>
            <Field label="ID Proof — Last 4" hint="Only the last 4 digits are stored (never the full number)">
              <TextInput value={form.idProofLast4} onChange={(v) => set("idProofLast4", maskLast4(v))} placeholder="1234" />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Joining Date">
              <TextInput type="date" value={form.joiningDate} onChange={(v) => set("joiningDate", v)} />
            </Field>
            <Field label="Exit Date">
              <TextInput type="date" value={form.exitDate} onChange={(v) => set("exitDate", v)} />
            </Field>
          </FormRow>
          <CheckboxInput checked={form.safetyInductionDone} onChange={(v) => set("safetyInductionDone", v)} label="Safety induction completed" />
          {editingId && (
            <Field label="Status">
              <SelectInput value={form.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} />
              {form.status === "inactive" && <InactiveStatusNotice entityName="Workman" />}
            </Field>
          )}
        </FormSection>
      </FormDrawer>
    </>
  );
}
