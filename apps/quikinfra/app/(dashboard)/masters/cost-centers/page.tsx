"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useCostCenters, useCreateCostCenter, useUpdateCostCenter, useProjects, useDeleteCostCenter } from "@/hooks/use-masters";
import { FormDrawer, FormSection, FormRow, Field, TextInput, SelectInput, InactiveStatusNotice } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import {
  validateForm, type ValidationRules,
  validateCode, validateMinLength,
} from "@/lib/validators";

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "code", label: "Code", required: true },
  { key: "name", label: "Name", required: true },
  { key: "projectName", label: "Project", hint: "Project name (auto-resolved) or leave blank" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface Row { id: string; code: string; name: string; projectName?: string; status: string; }
const columns: MasterColumnDef<Row>[] = [
  { key: "code", label: "Code", width: "100px" },
  { key: "name", label: "Cost Center", render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
  { key: "projectName", label: "Project" }, { key: "status", label: "Status", type: "status" },
];

const emptyForm = { code: "", name: "", projectId: "", status: "active" };

const rules: ValidationRules<typeof emptyForm> = {
  code: [
    { required: true, label: "Code" },
    { validator: (v) => validateCode(v, "Code") },
    { validator: (v) => validateMinLength(v, 2, "Code") },
  ],
  name: [
    { required: true, label: "Name" },
    { validator: (v) => validateMinLength(v, 2, "Name") },
  ],
};

export default function CostCentersPage() {
  const { data: result, isLoading } = useCostCenters();
  const { data: projectsResult } = useProjects();
  const createMutation = useCreateCostCenter();
  const updateMutation = useUpdateCostCenter();
  const deleteMutation = useDeleteCostCenter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof emptyForm>(key: K, val: (typeof emptyForm)[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };
  const projects = projectsResult?.data ?? [];
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.code?.trim()) return { ok: false as const, error: "Code is required" };
    if (!row.name?.trim()) return { ok: false as const, error: "Name is required" };
    let projectId = "";
    const projInput = row.projectName?.trim();
    if (projInput) {
      const match = projects.find((p) =>
        p.name?.toLowerCase() === projInput.toLowerCase() ||
        p.code?.toLowerCase() === projInput.toLowerCase() ||
        p.id === projInput,
      );
      if (!match) return { ok: false as const, error: `Project "${projInput}" not found` };
      projectId = match.id;
    }
    try {
      await createMutation.mutateAsync({
        code: row.code.trim().toUpperCase(),
        name: row.name.trim(),
        projectId: projectId || undefined,
        status: "active",
      });
      return { ok: true as const };
    } catch (err: unknown) {
      return { ok: false as const, error: toErrorMessage(err, "Create failed") };
    }
  };

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(emptyForm); setErrors({}); };

  const handleSubmit = async () => {
    const errs = validateForm(form, rules);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      if (editingId) await updateMutation.mutateAsync({ id: editingId, ...form });
      else await createMutation.mutateAsync(form);
      closeDrawer();
    } catch { /* error toast handled globally */ }
  };

  const handleDelete = async (item: { id: string }) => {
    await deleteMutation.mutateAsync(item.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="Cost Centers" entityName="Cost Center" permissionUrl="/masters/cost-centers" columns={columns}
        showStatusTabs
        data={(result?.data ?? []) as Row[]} total={result?.total ?? 0} isLoading={isLoading}
        canImport canExport
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item) => { setForm({ ...emptyForm, ...item } as typeof emptyForm); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item) => (
          <>
            Delete cost center{" "}
            <span className="font-semibold text-gray-900">“{item.name}”</span>?
            <br />
            It will be removed from the list. To keep a cost center but pause it,
            set its status to Inactive instead — those stay under the Inactive tab.
          </>
        )}
        emptyIcon={<BarChart3 className="w-8 h-8" />}
        emptyDescription="Cost centers track expenses against project budgets." />
      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Cost Center" : "Add Cost Center"}
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Cost Center Details">
          <FormRow>
            <Field label="Code" required error={errors.code}>
              <TextInput value={form.code} onChange={v => set("code", v.toUpperCase())} placeholder="CC-001" className="font-mono" invalid={!!errors.code} />
            </Field>
            <Field label="Name" required error={errors.name}>
              <TextInput value={form.name} onChange={v => set("name", v)} placeholder="Cost center name" invalid={!!errors.name} />
            </Field>
          </FormRow>
          <Field label="Project"><SelectInput value={form.projectId} onChange={v => set("projectId", v)} options={projectOptions} placeholder="Link to project (optional)" /></Field>
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
            {form.status === "inactive" && <InactiveStatusNotice entityName="Cost Center" />}
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Cost Center"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
