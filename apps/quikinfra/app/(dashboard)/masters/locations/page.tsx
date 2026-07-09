"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useLocations, useCreateLocation, useUpdateLocation, useProjects, useItems, useItemGroups, useDeleteLocation } from "@/hooks/use-masters";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, SelectInput, NumberInput, InactiveStatusNotice,
} from "@/components/FormDrawer";
import { GroupedMaterialMultiSelect } from "@/components/GroupedMaterialSelect";
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
import { toast } from "@/lib/toast";
import { OpenCageAddressAutocomplete } from "@/components/OpenCageAddressAutocomplete";

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "Location Name", required: true },
  { key: "type", label: "Type", required: true, hint: "site | warehouse | head_office | yard" },
  { key: "projectName", label: "Project", required: true, hint: "Project name (auto-resolved)" },
  { key: "address", label: "Address", hint: "Street / area (optional)" },
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
  itemIds?: string[];
  itemQtyByItemId?: Record<string, string> | null;
}

/** Full location record consumed by Edit — superset of the list row. */
interface LocationEditRow {
  id: string;
  name?: string; type?: string; projectId?: string;
  address?: string; city?: string; state?: string; inCharge?: string;
  capacity?: number | string | null; status?: string;
  itemIds?: string[];
  itemQtyByItemId?: unknown;
}

const TYPE_LABELS: Record<string, string> = { site: "Site", warehouse: "Warehouse", head_office: "Head Office", yard: "Yard" };

const LOCATION_TYPES = [
  { value: "site", label: "Site" }, { value: "warehouse", label: "Warehouse" },
  { value: "head_office", label: "Head Office" }, { value: "yard", label: "Yard" },
];

const emptyForm = {
  name: "",
  type: "site",
  projectId: "",
  address: "",
  city: "",
  state: "",
  inCharge: "",
  capacity: "",
  itemIds: [] as string[],
  itemQtyByItemId: {} as Record<string, string>,
  status: "active",
};

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
  const createMutation = useCreateLocation();
  const updateMutation = useUpdateLocation();
  const deleteMutation = useDeleteLocation();
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

  const { data: itemsResult } = useItems();
  const { data: itemGroupsResult } = useItemGroups();
  const items = itemsResult?.data ?? [];
  const itemById = new Map(items.map((it) => [it.id, it]));
  const itemGroups = useMemo(() => {
    const raw = itemGroupsResult?.data ?? [];
    return raw.filter((g) => (g?.status ?? "active").toLowerCase() !== "inactive");
  }, [itemGroupsResult?.data]);
  const groupedMaterialItems = useMemo(
    () =>
      (itemsResult?.data ?? []).map((it) => ({
        id: it.id,
        name: it.name,
        code: it.code,
        uomCode: it.uomCode ?? (Array.isArray(it.uomCodes) ? it.uomCodes[0] : null),
        hsnCode: it.hsnCode ?? null,
        groupId: it.groupId,
        groupName: it.groupName,
      })),
    [itemsResult?.data],
  );

  const columns: MasterColumnDef<LocationRow>[] = [
    { key: "code", label: "Code", width: "100px" },
    { key: "name", label: "Location", render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
    { key: "type", label: "Type", width: "110px", render: (row) => (
      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">{TYPE_LABELS[row.type] ?? row.type}</span>
    )},
    { key: "projectName", label: "Project" },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    {
      key: "items",
      label: "Items",
      render: (row) => {
        const ids = Array.isArray(row.itemIds) ? row.itemIds : [];
        if (ids.length === 0) return "—";
        const names = ids
          .map((id) => itemById.get(id))
          .map((it) => (it?.code ? `${it.code}` : it?.name))
          .filter(Boolean) as string[];
        if (names.length === 0) return `${ids.length} item${ids.length === 1 ? "" : "s"}`;
        const shown = names.slice(0, 2);
        const rest = Math.max(0, names.length - shown.length);
        return (
          <span className="text-gray-700">
            {shown.join(", ")}
            {rest ? <span className="text-gray-400"> +{rest}</span> : null}
          </span>
        );
      },
    },
    {
      key: "qty",
      label: "Qty",
      width: "90px",
      render: (row) => {
        const ids = Array.isArray(row.itemIds) ? row.itemIds : [];
        const m = row.itemQtyByItemId ?? null;
        if (!ids.length || !m) return "—";
        let sum = 0;
        let any = false;
        for (const id of ids) {
          const raw = m[id];
          const n = raw === undefined || raw === null || String(raw).trim() === "" ? NaN : Number(raw);
          if (!Number.isFinite(n)) continue;
          sum += n;
          any = true;
        }
        return any ? String(sum) : "—";
      },
    },
    { key: "inCharge", label: "In-Charge" },
    { key: "status", label: "Status", type: "status" },
  ];

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.name?.trim()) return { ok: false as const, error: "Location name is required" };
    if (!row.type?.trim()) return { ok: false as const, error: "Type is required" };
    if (!row.state?.trim()) return { ok: false as const, error: "State is required" };
    if (!row.city?.trim()) return { ok: false as const, error: "City is required" };
    const projInput = row.projectName?.trim();
    if (!projInput) return { ok: false as const, error: "Project is required" };
    const project = projects.find((p) =>
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
        address: row.address?.trim() || undefined,
        state: row.state.trim(),
        city: row.city.trim(),
        inCharge: row.inCharge?.trim() || undefined,
        capacity: row.capacity?.trim() || undefined,
        status: "active",
      });
      return { ok: true as const };
    } catch (err: unknown) {
      return { ok: false as const, error: toErrorMessage(err, "Create failed") };
    }
  };

  const loadFormFromRow = (item: LocationEditRow) => {
    const rawQty = item?.itemQtyByItemId;
    const qty: Record<string, string> =
      rawQty && typeof rawQty === "object" && !Array.isArray(rawQty)
        ? Object.fromEntries(
            Object.entries(rawQty as Record<string, unknown>).map(([k, v]) => [
              k,
              v === null || v === undefined ? "" : String(v),
            ]),
          )
        : {};
    const itemIds: string[] = Array.isArray(item?.itemIds) ? item.itemIds : [];
    for (const k of Object.keys(qty)) {
      if (!itemIds.includes(k)) delete qty[k];
    }
    for (const id of itemIds) {
      if (qty[id] === undefined) qty[id] = "";
    }
    setForm({
      ...emptyForm,
      name: item.name ?? "",
      type: item.type ?? "site",
      projectId: item.projectId ?? "",
      address: item.address ?? "",
      city: item.city ?? "",
      state: item.state ?? "",
      inCharge: item.inCharge ?? "",
      capacity: item.capacity != null ? String(item.capacity) : "",
      status: item.status ?? "active",
      itemIds,
      itemQtyByItemId: qty,
    });
    setErrors({});
    setEditingId(item.id);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
  };

  const handleSubmit = async () => {
    const errs = validateForm(form, rules);
    // At least one material must be stocked at the location, and each picked
    // material needs a positive quantity — an allotted qty of 0 (or blank)
    // is meaningless and would leave the location with nothing to consume.
    if (!form.itemIds || form.itemIds.length === 0) {
      errs.itemIds = "Add at least one material";
    } else {
      const missingQty = form.itemIds.some(
        (id) => !(parseFloat(form.itemQtyByItemId?.[id] ?? "") > 0),
      );
      if (missingQty) errs.itemQty = "Enter a quantity for every material";
    }
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
      <MasterListPage title="Locations / Sites / Warehouses" entityName="Location" permissionUrl="/masters/locations" columns={columns}
        data={(result?.data ?? []) as LocationRow[]} total={result?.data?.length ?? 0} isLoading={isLoading}
        canImport
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item) => {
          loadFormFromRow(item);
          setDrawerOpen(true);
        }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item) => (
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

      <FormDrawer key={editingId ?? "new"} open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Location" : "Add Location"}
        subtitle={editingId ? "Update site/warehouse details" : "Register a storage location or site"}
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Location Details">
          <Field label="Location Name" required error={errors.name}>
            <TextInput value={form.name} onChange={v => set("name", v)} placeholder="Main Store - Project Alpha" invalid={!!errors.name} />
          </Field>
          <FormRow>
            <Field label="Project" required error={errors.projectId}>
              <SelectInput value={form.projectId} onChange={v => set("projectId", v)} options={projectOptions} placeholder="Select project" invalid={!!errors.projectId} />
            </Field>
            <Field label="Location Type" required error={errors.type}>
              <SelectInput value={form.type} onChange={v => set("type", v)} options={LOCATION_TYPES} invalid={!!errors.type} />
            </Field>
          </FormRow>
          <Field
            label="Address"

          >
            <OpenCageAddressAutocomplete
              value={form.address}
              onChange={(v) => set("address", v)}
              onSuggestionPick={(pick) => {
                setForm((prev) => {
                  const nextState = pick.state ?? prev.state;
                  let nextCity = prev.city;
                  if (pick.cityMatched && pick.city) nextCity = pick.city;
                  else if (pick.state && pick.state !== prev.state) nextCity = "";
                  return {
                    ...prev,
                    address: pick.formatted,
                    state: nextState,
                    city: nextCity,
                  };
                });
                if (pick.cityMatched && pick.city) {
                  toast.success("Address, state, and city filled from suggestion.");
                } else if (pick.state) {
                  toast.info("Pick a city from the list if needed.");
                }
              }}
              placeholder="Search places in India…"
            />
          </Field>
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
          <Field
            label="Items"
            required
            error={errors.itemIds}
            hint="Pick items stored here — choose an item group first, then materials (same as Indents / RFQ)"
          >
            <GroupedMaterialMultiSelect
              values={form.itemIds}
              onChange={(nextIds) => {
                setForm((prev) => {
                  const nextQty: Record<string, string> = { ...(prev.itemQtyByItemId ?? {}) };
                  for (const k of Object.keys(nextQty)) {
                    if (!nextIds.includes(k)) delete nextQty[k];
                  }
                  for (const id of nextIds) {
                    if (nextQty[id] === undefined) nextQty[id] = "";
                  }
                  return { ...prev, itemIds: nextIds, itemQtyByItemId: nextQty };
                });
                setErrors((prev) => {
                  if (!prev.itemIds && !prev.itemQty) return prev;
                  const next = { ...prev };
                  delete next.itemIds;
                  delete next.itemQty;
                  return next;
                });
              }}
              items={groupedMaterialItems}
              groups={itemGroups}
              placeholder="Select material(s)"
            />
          </Field>
          {form.itemIds.length > 0 ? (
            <div className="mt-2 space-y-2">
              {form.itemIds.map((id) => {
                const it = itemById.get(id) as { code?: string; name?: string; uomCode?: string; uomCodes?: string[] } | undefined;
                const uom = it?.uomCode || (Array.isArray(it?.uomCodes) ? it.uomCodes[0] : "") || "—";
                const label = it?.code ? `${it.code} — ${it.name}` : (it?.name ?? id);
                return (
                  <div key={id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium break-words text-gray-900">{label}</div>
                      <div className="text-xs text-gray-500">UOM: {uom}</div>
                    </div>
                    <div className="w-40 shrink-0">
                      <NumberInput
                        value={form.itemQtyByItemId?.[id] ?? ""}
                        onChange={(v) => {
                          setForm((prev) => ({
                            ...prev,
                            itemQtyByItemId: { ...(prev.itemQtyByItemId ?? {}), [id]: v },
                          }));
                          if (errors.itemQty) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next.itemQty;
                              return next;
                            });
                          }
                        }}
                        min={0}
                        step="0.0001"
                        placeholder="Qty"
                        invalid={
                          !!errors.itemQty &&
                          !(parseFloat(form.itemQtyByItemId?.[id] ?? "") > 0)
                        }
                      />
                    </div>
                  </div>
                );
              })}
              {errors.itemQty && (
                <p className="text-xs text-rose-600">{errors.itemQty}</p>
              )}
            </div>
          ) : null}
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
            {form.status === "inactive" && <InactiveStatusNotice entityName="Location" />}
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
