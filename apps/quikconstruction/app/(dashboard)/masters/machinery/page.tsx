"use client";

import { useState } from "react";
import { Hammer } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useMachinery, useCreateMachinery, useUpdateMachinery, useProjects } from "@/hooks/use-masters";
import { FormDrawer, FormSection, FormRow, Field, TextInput, SelectInput } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import {
  validateForm, type ValidationRules,
  validateMinLength,
} from "@/lib/validators";

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "Machine Name", required: true },
  { key: "type", label: "Type", required: true, hint: "Excavator | Crane | JCB | …" },
  { key: "make", label: "Make / Brand" },
  { key: "model", label: "Model" },
  { key: "registrationNo", label: "Registration No" },
  { key: "fuelType", label: "Fuel Type", hint: "Diesel | Petrol | Electric | NA" },
  { key: "projectName", label: "Project", hint: "Project name (auto-resolved to ID) or leave blank" },
  { key: "capacity", label: "Capacity" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface Row { id: string; code: string; name: string; type: string; make?: string; registrationNo?: string; projectName?: string; fuelType?: string; status: string; }
const columns: MasterColumnDef<Row>[] = [
  { key: "code", label: "Code", width: "100px" },
  { key: "name", label: "Machine / Equipment", render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
  { key: "type", label: "Type" }, { key: "make", label: "Make" },
  { key: "registrationNo", label: "Reg. No" }, { key: "projectName", label: "Project" },
  { key: "fuelType", label: "Fuel", width: "80px" }, { key: "status", label: "Status", type: "status" },
];

const MACHINE_TYPES = ["Excavator","Crane","JCB","Concrete Mixer","Transit Mixer","Roller","Compactor","Generator","Welding Machine","Pump","Tower Crane","Batching Plant","Other"].map(t => ({ value: t, label: t }));
const FUEL_TYPES = [{ value: "Diesel", label: "Diesel" }, { value: "Petrol", label: "Petrol" }, { value: "Electric", label: "Electric" }, { value: "NA", label: "N/A" }];

const emptyForm = { name: "", type: "", make: "", model: "", registrationNo: "", projectId: "", fuelType: "Diesel", capacity: "", status: "active" };

const rules: ValidationRules<typeof emptyForm> = {
  name: [
    { required: true, label: "Machine name" },
    { validator: (v) => validateMinLength(v, 2, "Machine name") },
  ],
  type: [{ required: true, label: "Machine type" }],
  registrationNo: [{ validator: (v) => validateMinLength(v, 5, "Registration No") }],
};

export default function MachineryPage() {
  const { data: result, isLoading } = useMachinery();
  const { data: projectsResult } = useProjects();
  const createMutation = useCreateMachinery();
  const updateMutation = useUpdateMachinery();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: string, val: any) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };
  const projects = projectsResult?.data ?? [];
  const projectOptions = projects.map((p: any) => ({ value: p.id, label: p.name }));

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.name?.trim()) return { ok: false as const, error: "Machine name is required" };
    if (!row.type?.trim()) return { ok: false as const, error: "Machine type is required" };
    let projectId = "";
    const projInput = row.projectName?.trim();
    if (projInput) {
      const match = projects.find((p: any) =>
        p.name?.toLowerCase() === projInput.toLowerCase() ||
        p.code?.toLowerCase() === projInput.toLowerCase() ||
        p.id === projInput,
      );
      if (!match) return { ok: false as const, error: `Project "${projInput}" not found` };
      projectId = match.id;
    }
    try {
      await createMutation.mutateAsync({
        name: row.name.trim(),
        type: row.type.trim(),
        make: row.make?.trim() || undefined,
        model: row.model?.trim() || undefined,
        registrationNo: row.registrationNo?.trim() || undefined,
        fuelType: row.fuelType?.trim() || "Diesel",
        projectId: projectId || undefined,
        capacity: row.capacity?.trim() || undefined,
        status: "active",
      });
      return { ok: true as const };
    } catch (err: any) {
      return { ok: false as const, error: err?.message ?? "Create failed" };
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
    } catch (err: any) { alert(err.message); }
  };

  const handleDelete = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="Machinery & Equipment" entityName="Machine" columns={columns}
        data={result?.data ?? []} total={result?.total ?? 0} isLoading={isLoading}
        canImport
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item: any) => { setForm({ ...emptyForm, ...item }); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item: any) => (
          <>
            Delete machine{" "}
            <span className="font-semibold text-gray-900">“{item.name}”</span>?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        canExport
        emptyIcon={<Hammer className="w-8 h-8" />}
        emptyDescription="Track excavators, cranes, JCBs, transit mixers, and other equipment." />

      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Machine / Equipment" : "Add Machine / Equipment"} width="xl"
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Machine Details">
          <FormRow>
            <Field label="Machine Name" required error={errors.name}>
              <TextInput value={form.name} onChange={v => set("name", v)} placeholder="e.g. Excavator - Tata Hitachi EX200" invalid={!!errors.name} />
            </Field>
            <Field label="Machine Type" required error={errors.type}>
              <SelectInput value={form.type} onChange={v => set("type", v)} options={MACHINE_TYPES} placeholder="Select type" invalid={!!errors.type} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Make / Brand"><TextInput value={form.make} onChange={v => set("make", v)} placeholder="Tata Hitachi" /></Field>
            <Field label="Model"><TextInput value={form.model} onChange={v => set("model", v)} placeholder="EX200LC" /></Field>
          </FormRow>
          <FormRow>
            <Field label="Registration No" error={errors.registrationNo}>
              <TextInput value={form.registrationNo} onChange={v => set("registrationNo", v)} placeholder="MH-01-AB-1234" invalid={!!errors.registrationNo} />
            </Field>
            <Field label="Fuel Type"><SelectInput value={form.fuelType} onChange={v => set("fuelType", v)} options={FUEL_TYPES} /></Field>
          </FormRow>
          <FormRow>
            <Field label="Assigned Project"><SelectInput value={form.projectId} onChange={v => set("projectId", v)} options={projectOptions} placeholder="Select project" /></Field>
            <Field label="Capacity"><TextInput value={form.capacity} onChange={v => set("capacity", v)} placeholder="e.g. 20 Ton" /></Field>
          </FormRow>
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Machine"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
