"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useCallback, useMemo, useState } from "react";
import { Boxes } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useItemGroups, useCreateItemGroup, useUpdateItemGroup, useWorkCategories, useDeleteItemGroup } from "@/hooks/use-masters";
import { FormDrawer, FormSection, FormRow, Field, TextInput, NumberInput, SelectInput, InactiveStatusNotice } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import {
  validateForm, type ValidationRules,
  validateMinLength, validatePositiveInteger,
} from "@/lib/validators";

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "Group Name", required: true },
  { key: "parentName", label: "Parent Group", hint: "Existing group name (auto-resolved) or blank for top-level" },
  { key: "workCategoryName", label: "Work Category", hint: "Existing work category name (optional)" },
  { key: "sortOrder", label: "Sort Order" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface Row {
  id: string;
  name: string;
  parentId?: string;
  parentName?: string;
  depth: number;
  itemCount?: number;
  status: string;
}

const emptyForm = { name: "", parentId: "", workCategoryId: "", sortOrder: "1", status: "active" };

const rules: ValidationRules<typeof emptyForm> = {
  name: [
    { required: true, label: "Group name" },
    { validator: (v) => validateMinLength(v, 2, "Group name") },
  ],
  sortOrder: [{ validator: (v) => validatePositiveInteger(v, "Sort order") }],
};

export default function ItemGroupsPage() {
  const { data: result, isLoading } = useItemGroups();
  const { data: wcResult } = useWorkCategories();
  const createMutation = useCreateItemGroup();
  const updateMutation = useUpdateItemGroup();
  const deleteMutation = useDeleteItemGroup();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof emptyForm>(key: K, val: (typeof emptyForm)[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  const allGroups = useMemo(() => (result?.data ?? []) as Row[], [result]);
  const workCategories = wcResult?.data ?? [];
  const wcOptions = workCategories.filter((w) => w?.status === "active").map((w) => ({ value: w.id, label: w.name }));

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.name?.trim()) return { ok: false as const, error: "Group name is required" };
    let parentId = "";
    let parentName = "";
    let depth = 0;
    const parentInput = row.parentName?.trim();
    if (parentInput) {
      const parent = allGroups.find((g) =>
        g.name?.toLowerCase() === parentInput.toLowerCase() || g.id === parentInput,
      );
      if (!parent) return { ok: false as const, error: `Parent group "${parentInput}" not found` };
      parentId = parent.id;
      parentName = parent.name;
      depth = Math.min((parent.depth ?? 0) + 1, 2);
    }
    let workCategoryId = "";
    const wcInput = row.workCategoryName?.trim();
    if (wcInput) {
      const wc = workCategories.find((w) =>
        w.name?.toLowerCase() === wcInput.toLowerCase() || w.id === wcInput,
      );
      if (!wc) return { ok: false as const, error: `Work category "${wcInput}" not found` };
      workCategoryId = wc.id;
    }
    try {
      await createMutation.mutateAsync({
        name: row.name.trim(),
        parentId: parentId || undefined,
        parentName: parentName || undefined,
        depth,
        workCategoryId: workCategoryId || undefined,
        sortOrder: row.sortOrder?.trim() || "1",
        status: "active",
      });
      return { ok: true as const };
    } catch (err: unknown) {
      return { ok: false as const, error: toErrorMessage(err, "Create failed") };
    }
  };

  // id → group lookup for resolving parent names in the table. Rebuilds
  // only when the underlying query data changes, so the columns config
  // stays stable across form keystrokes.
  const groupById = useMemo(() => {
    const map: Record<string, Row> = {};
    for (const g of allGroups) map[g.id] = g;
    return map;
  }, [allGroups]);

  const resolveParent = useCallback(
    (row: Row): string =>
      (row.parentId && groupById[row.parentId]?.name) || row.parentName || "",
    [groupById]
  );

  // Collect the set of ids that a given node cannot choose as a parent:
  // itself, and every descendant (transitively). This is what prevents
  // the "parent = self" bug and any longer cycle like A → B → A.
  const collectForbiddenIds = (nodeId: string | null): Set<string> => {
    const forbidden = new Set<string>();
    if (!nodeId) return forbidden;
    forbidden.add(nodeId);
    const stack = [nodeId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const g of allGroups) {
        if (g.parentId === cur && !forbidden.has(g.id)) {
          forbidden.add(g.id);
          stack.push(g.id);
        }
      }
    }
    return forbidden;
  };

  // Build the Parent Group dropdown options. When editing, exclude the
  // node itself and its descendants. Rows at depth 2 are already leaves
  // (max 3 levels of hierarchy) so they can't be parents either.
  const parentOptions = useMemo(() => {
    const forbidden = collectForbiddenIds(editingId);
    return allGroups
      .filter((g) => (g.depth ?? 0) < 2 && !forbidden.has(g.id) && g.status !== "inactive")
      .map((g) => ({
        value: g.id,
        label: `${"— ".repeat(g.depth ?? 0)}${g.name}`,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGroups, editingId]);

  const columns: MasterColumnDef<Row>[] = useMemo(() => [
    {
      key: "name",
      label: "Group Name",
      render: (row) => (
        <span
          className="font-medium text-gray-900"
          style={{ paddingLeft: (row.depth ?? 0) * 16 }}
        >
          {row.name}
        </span>
      ),
    },
    {
      key: "parentName",
      label: "Parent Group",
      render: (row) => <span className="text-gray-700">{resolveParent(row) || "—"}</span>,
      getValue: (row) => resolveParent(row),
    },
    {
      key: "depth",
      label: "Level",
      width: "80px",
      render: (row) => (
        <span
          className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            row.depth === 0
              ? "bg-orange-50 text-orange-700"
              : row.depth === 1
              ? "bg-green-50 text-green-700"
              : "bg-orange-50 text-orange-700"
          }`}
        >
          L{(row.depth ?? 0) + 1}
        </span>
      ),
    },
    { key: "itemCount", label: "Items", width: "80px" },
    { key: "status", label: "Status", type: "status" },
  ], [resolveParent]);

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(emptyForm); setErrors({}); };

  const handleSubmit = async () => {
    const errs = validateForm(form, rules);
    if (Object.keys(errs).length) { setErrors(errs); return; }

    // Compute depth from the selected parent so nested levels render
    // correctly in the list. Top-level = 0; otherwise parent.depth + 1.
    // Also stamp parentName on the row so the table (and CSV export)
    // still show the parent if the master query is stale.
    const parent = form.parentId ? groupById[form.parentId] : null;
    const depth = parent ? Math.min((parent.depth ?? 0) + 1, 2) : 0;
    const parentName = parent?.name ?? "";
    const payload = { ...form, depth, parentName };

    try {
      if (editingId) await updateMutation.mutateAsync({ id: editingId, ...payload });
      else await createMutation.mutateAsync(payload);
      closeDrawer();
    } catch { /* error toast handled globally */ }
  };

  const handleDelete = async (item: { id: string }) => {
    await deleteMutation.mutateAsync(item.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="Item Groups / Categories" entityName="Item Group" permissionUrl="/masters/item-groups" columns={columns}
        showStatusTabs
        data={allGroups} total={result?.total ?? 0} isLoading={isLoading}
        canImport canExport
        historyEntityType="item_group"
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item) => { setForm({ ...emptyForm, ...item } as typeof emptyForm); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item) => (
          <>
            Delete item group{" "}
            <span className="font-semibold text-gray-900">“{item.name}”</span>?
            <br />
            It will be removed from the list. To keep an item group but pause it,
            set its status to Inactive instead — those stay under the Inactive tab.
          </>
        )}
        emptyIcon={<Boxes className="w-8 h-8" />}
        emptyDescription="Item groups organize materials hierarchically — e.g. Steel > TMT Bars > 10mm." />
      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Item Group" : "Add Item Group"} subtitle="Max 3 levels of hierarchy"
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Group Details">
          <Field label="Group Name" required error={errors.name}>
            <TextInput value={form.name} onChange={v => set("name", v)} placeholder="e.g. TMT Bars" invalid={!!errors.name} />
          </Field>
          <Field
            label="Parent Group"
            hint={
              editingId
                ? "A group cannot be its own parent — self and descendants are hidden below."
                : "Leave empty for top-level group"
            }
          >
            <SelectInput
              value={form.parentId}
              onChange={v => set("parentId", v)}
              options={parentOptions}
              placeholder="None (Top Level)"
            />
          </Field>
          <FormRow>
            <Field label="Work Category Link">
              <SelectInput value={form.workCategoryId} onChange={v => set("workCategoryId", v)} options={wcOptions} placeholder="Optional" />
            </Field>
            <Field label="Sort Order" error={errors.sortOrder}>
              <NumberInput value={form.sortOrder} onChange={v => set("sortOrder", v)} min={1} invalid={!!errors.sortOrder} />
            </Field>
          </FormRow>
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
            {form.status === "inactive" && <InactiveStatusNotice entityName="Item Group" />}
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Item Group"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
