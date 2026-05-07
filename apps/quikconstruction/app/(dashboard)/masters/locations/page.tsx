"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useLocations, useCreateLocation, useUpdateLocation, useProjects, useItemGroups, useItems } from "@/hooks/use-masters";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, SelectInput, MultiSelectInput,
} from "@/components/FormDrawer";
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
import { StateCitySelect } from "@/components/StateCitySelect";

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "Location Name", required: true },
  { key: "type", label: "Type", required: true, hint: "site | warehouse | head_office | yard" },
  { key: "projectName", label: "Project", required: true, hint: "Project name (auto-resolved)" },
  { key: "state", label: "State", required: true },
  { key: "city", label: "City", required: true },
  { key: "inCharge", label: "In-Charge" },
  { key: "capacity", label: "Capacity" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface LocationRow {
  id: string; code: string; name: string; type: string; projectName?: string;
  city?: string; state?: string; inCharge?: string; status: string;
}

const TYPE_LABELS: Record<string, string> = { site: "Site", warehouse: "Warehouse", head_office: "Head Office", yard: "Yard" };

const columns: MasterColumnDef<LocationRow>[] = [
  { key: "code", label: "Code", width: "100px" },
  { key: "name", label: "Location", render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
  { key: "type", label: "Type", width: "110px", render: (row) => (
    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">{TYPE_LABELS[row.type] ?? row.type}</span>
  )},
  { key: "projectName", label: "Project" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "inCharge", label: "In-Charge" },
  { key: "status", label: "Status", type: "status" },
];

const LOCATION_TYPES = [
  { value: "site", label: "Site" }, { value: "warehouse", label: "Warehouse" },
  { value: "head_office", label: "Head Office" }, { value: "yard", label: "Yard" },
];

const emptyForm = { name: "", type: "site", projectId: "", city: "", state: "", inCharge: "", capacity: "", itemGroupId: "", itemIds: [] as string[], status: "active" };

const rules: ValidationRules<typeof emptyForm> = {
  name: [
    { required: true, label: "Location name" },
    { validator: (v) => validateMinLength(v, 2, "Location name") },
  ],
  type: [{ required: true, label: "Location type" }],
  projectId: [{ required: true, label: "Project" }],
  state: [{ required: true, label: "State" }],
  city: [{ required: true, label: "City" }],
};

export default function LocationsPage() {
  const { data: result, isLoading } = useLocations();
  const { data: projectsResult } = useProjects();
  const { data: itemGroupsResult } = useItemGroups();
  const createMutation = useCreateLocation();
  const updateMutation = useUpdateLocation();
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

  const itemGroups = itemGroupsResult?.data ?? [];
  const itemGroupOptions = itemGroups.map((g: any) => ({ value: g.id, label: g.name }));

  // Items list re-fetches whenever the picked group changes — server-side
  // filter via groupId keeps the dropdown in sync without client-side massage.
  const { data: itemsResult } = useItems(
    form.itemGroupId ? { groupId: form.itemGroupId } : undefined,
  );
  const itemOptions = (itemsResult?.data ?? []).map((it: any) => ({
    value: it.id,
    label: it.code ? `${it.code} — ${it.name}` : it.name,
  }));

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.name?.trim()) return { ok: false as const, error: "Location name is required" };
    if (!row.type?.trim()) return { ok: false as const, error: "Type is required" };
    if (!row.state?.trim()) return { ok: false as const, error: "State is required" };
    if (!row.city?.trim()) return { ok: false as const, error: "City is required" };
    const projInput = row.projectName?.trim();
    if (!projInput) return { ok: false as const, error: "Project is required" };
    const project = projects.find((p: any) =>
      p.name?.toLowerCase() === projInput.toLowerCase() ||
      p.code?.toLowerCase() === projInput.toLowerCase() ||
      p.id === projInput,
    );
    if (!project) return { ok: false as const, error: `Project "${projInput}" not found` };
    try {
      await createMutation.mutateAsync({
        name: row.name.trim(),
        type: row.type.trim().toLowerCase(),
        projectId: project.id,
        state: row.state.trim(),
        city: row.city.trim(),
        inCharge: row.inCharge?.trim() || undefined,
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
      <MasterListPage title="Locations / Sites / Warehouses" entityName="Location" columns={columns}
        data={result?.data ?? []} total={result?.data?.length ?? 0} isLoading={isLoading}
        canImport
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item: any) => { setForm({ ...emptyForm, ...item }); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item: any) => (
          <>
            Delete location{" "}
            <span className="font-semibold text-gray-900">“{item.name}”</span>?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        canExport
        emptyIcon={<MapPin className="w-8 h-8" />}
        emptyDescription="Locations are where stock is stored and tracked — sites, warehouses, yards." />

      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Location" : "Add Location"}
        subtitle={editingId ? "Update site/warehouse details" : "Register a storage location or site"}
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Location Details">
          <Field label="Location Name" required error={errors.name}>
            <TextInput value={form.name} onChange={v => set("name", v)} placeholder="Main Store - Project Alpha" invalid={!!errors.name} />
          </Field>
          <FormRow>
            <Field label="Location Type" required error={errors.type}>
              <SelectInput value={form.type} onChange={v => set("type", v)} options={LOCATION_TYPES} invalid={!!errors.type} />
            </Field>
            <Field label="Project" required error={errors.projectId}>
              <SelectInput value={form.projectId} onChange={v => set("projectId", v)} options={projectOptions} placeholder="Select project" invalid={!!errors.projectId} />
            </Field>
          </FormRow>
          <StateCitySelect
            required
            state={form.state}
            city={form.city}
            onStateChange={v => set("state", v)}
            onCityChange={v => set("city", v)}
            stateError={errors.state}
            cityError={errors.city}
          />
          <FormRow>
            <Field label="In-Charge / Store Keeper">
              <TextInput value={form.inCharge} onChange={v => set("inCharge", v)} placeholder="Person name" />
            </Field>
            <Field label="Storage Capacity">
              <TextInput value={form.capacity} onChange={v => set("capacity", v)} placeholder="e.g. 500 MT" />
            </Field>
          </FormRow>
          <Field label="Item Group" hint="Optional — pick a group to filter the items list below">
            <SelectInput
              value={form.itemGroupId}
              onChange={(v) => {
                setForm((prev) => ({ ...prev, itemGroupId: v, itemIds: [] }));
              }}
              options={itemGroupOptions}
              placeholder="Select item group"
            />
          </Field>
          <Field
            label="Items"
            hint={form.itemGroupId ? "Pick the items stored at this location" : "Select an item group first"}
          >
            <MultiSelectInput
              values={form.itemIds}
              onChange={(v) => set("itemIds", v)}
              options={itemOptions}
              placeholder={form.itemGroupId ? "Select item(s)" : "Select an item group first"}
              disabled={!form.itemGroupId}
            />
          </Field>
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Location"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
