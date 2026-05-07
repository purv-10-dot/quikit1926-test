"use client";

/**
 * New Workflow Drawer — mirrors EditWorkflowDrawer but for creation.
 * Kept structurally identical so the New and Edit forms look the same:
 * per-step role select + role-filtered user picker.
 */

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Layers } from "lucide-react";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, NumberInput, SelectInput, CheckboxInput,
} from "@/components/FormDrawer";
import { useCreateWorkflow, useDeleteWorkflow, useUsers } from "@/hooks/use-approvals";
import { useProjects } from "@/hooks/use-masters";
import { getClientSelectableUserTypes } from "@/lib/rbac/user-types";

const ENTITY_TYPE_OPTIONS = [
  { value: "purchase_requisitions", label: "Purchase Requisitions" },
  { value: "purchase_indents", label: "Purchase Indents" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "rfqs", label: "RFQs" },
  { value: "grn", label: "GRN" },
  { value: "material_estimations", label: "Material Estimation" },
  { value: "work_order", label: "Work Orders" },
  { value: "dpr", label: "Daily Progress Report" },
  { value: "stock_reconciliation", label: "Stock Reconciliation" },
  { value: "good_return", label: "Good Return" },
  { value: "material_issues", label: "Material Issue" },
  { value: "gate_pass", label: "Gate Pass" },
  { value: "transfer", label: "Stock Transfer" },
];

const ROLE_OPTIONS = getClientSelectableUserTypes().map((t) => ({
  value: t.key,
  label: t.label,
}));

interface StepRow {
  stepOrder: string;
  approverRole: string;
  approverUserId: string;
}

interface ModuleMode {
  /** Display label for the module banner inside the drawer. */
  moduleLabel: string;
  /** Entity types this single workflow definition should be saved
   *  against. The drawer creates one workflow row per type. */
  entityTypes: Array<{ type: string; label: string }>;
  /** Optional pre-fill (workflow name + steps) to seed the form when
   *  editing an existing module-level config. */
  prefill?: {
    name: string;
    isActive: boolean;
    steps: Array<{ stepOrder: string; approverRole: string; approverUserId: string }>;
  };
  /** Optional list of existing workflow ids in this module that should
   *  be deleted before saving — used by the "Edit module" flow which
   *  is a replace-all. Empty / omitted = pure create. */
  replaceIds?: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, pre-selects the Entity Type dropdown — used by the
   *  per-entity "Configure Workflow" buttons on the workflows page. */
  defaultEntityType?: string;
  /** When set, the drawer enters module-mode: one workflow definition
   *  is saved across multiple entity types in one click. The single
   *  entity dropdown is hidden and a covered-pages strip shows
   *  instead. Mutually exclusive with `defaultEntityType`. */
  moduleMode?: ModuleMode;
}

export function NewWorkflowDrawer({ open, onClose, defaultEntityType, moduleMode }: Props) {
  const createMutation = useCreateWorkflow();
  const deleteMutation = useDeleteWorkflow();
  const { data: usersResult } = useUsers();
  const { data: projectsResult } = useProjects();
  const allUsers = usersResult?.data ?? [];
  const allProjects = projectsResult?.data ?? [];

  const userById = useMemo(() => {
    const map = new Map<string, any>();
    for (const u of allUsers) map.set(u.id, u);
    return map;
  }, [allUsers]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allProjects) map.set(p.id, p.siteName ?? p.name ?? p.code ?? p.id);
    return map;
  }, [allProjects]);

  const usersByRole = useMemo(() => {
    const map = new Map<string, Array<{ id: string; fullName: string; email: string }>>();
    for (const u of allUsers) {
      if (u.status && u.status !== "active") continue;
      const list = map.get(u.userType) ?? [];
      list.push({ id: u.id, fullName: u.fullName, email: u.email });
      map.set(u.userType, list);
    }
    return map;
  }, [allUsers]);

  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [steps, setSteps] = useState<StepRow[]>([
    { stepOrder: "1", approverRole: "", approverUserId: "" },
  ]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (moduleMode?.prefill) {
      setName(moduleMode.prefill.name);
      setIsActive(moduleMode.prefill.isActive);
      setSteps(
        moduleMode.prefill.steps.length > 0
          ? moduleMode.prefill.steps
          : [{ stepOrder: "1", approverRole: "", approverUserId: "" }],
      );
    } else {
      setName("");
      setIsActive(true);
      setSteps([{ stepOrder: "1", approverRole: "", approverUserId: "" }]);
    }
    // In module mode the single entity dropdown is hidden, but we still
    // clear the field so it doesn't carry stale state from a previous
    // single-entity open.
    setEntityType(moduleMode ? "" : (defaultEntityType ?? ""));
    setError("");
  }, [open, defaultEntityType, moduleMode]);

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      { stepOrder: String(prev.length + 1), approverRole: "", approverUserId: "" },
    ]);

  const removeStep = (idx: number) =>
    setSteps((prev) => prev.filter((_, i) => i !== idx));

  const updateStep = (idx: number, patch: Partial<StepRow>) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const handleSubmit = async () => {
    setError("");
    if (!name.trim()) return setError("Workflow name is required");
    if (!moduleMode && !entityType) return setError("Entity type is required");
    if (steps.length === 0) return setError("Add at least one approval step");

    // Every step needs both a role and a specific user pinned. A bare
    // role-only step routes to whoever in the org has that role, which
    // is too loose — admins want a named approver per step so there's
    // no ambiguity about who's blocking a document.
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!;
      if (!s.approverRole) return setError(`Step ${i + 1}: select an approver role`);
      if (!s.approverUserId) return setError(`Step ${i + 1}: select an approver user`);
    }

    const stepPayload = steps.map((s) => ({
      stepOrder: Number(s.stepOrder) || 1,
      approverRole: s.approverRole,
      approverUserId: s.approverUserId,
    }));

    try {
      if (moduleMode) {
        // Replace-all flow when editing: drop the existing rows so we
        // don't trip the per-entity "active workflow already exists"
        // unique constraint, then create one fresh row per entity type
        // sharing the same name + steps. The user sees a single module
        // workflow but the data model keeps one row per document type
        // so existing approval lookups (which key by entityType) keep
        // working unchanged.
        if (moduleMode.replaceIds && moduleMode.replaceIds.length > 0) {
          for (const id of moduleMode.replaceIds) {
            await deleteMutation.mutateAsync(id);
          }
        }
        for (const et of moduleMode.entityTypes) {
          await createMutation.mutateAsync({
            name: name.trim(),
            entityType: et.type,
            isActive,
            steps: stepPayload,
          });
        }
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          entityType,
          isActive,
          steps: stepPayload,
        });
      }
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to create workflow");
    }
  };

  return (
    <FormDrawer
      open={open}
      onClose={onClose}
      title={
        moduleMode
          ? moduleMode.replaceIds && moduleMode.replaceIds.length > 0
            ? `Edit ${moduleMode.moduleLabel} Workflow`
            : `Configure ${moduleMode.moduleLabel} Workflow`
          : "New Approval Workflow"
      }
      subtitle={
        moduleMode
          ? `Single workflow applied to every page in ${moduleMode.moduleLabel}.`
          : "Configure multi-level approval routing"
      }
      width="2xl"
      onSubmit={handleSubmit}
      loading={createMutation.isPending || deleteMutation.isPending}
      submitLabel={
        moduleMode?.replaceIds && moduleMode.replaceIds.length > 0
          ? "Save Changes"
          : "Create"
      }
    >
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 mb-3">
          {error}
        </div>
      )}

      {/* Covered pages strip — shown only in module mode so the admin
          can see at a glance which document types this single workflow
          definition will end up applied to. The save button below
          creates one workflow row per chip. */}
      {moduleMode && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 mb-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-800 mb-2">
            <Layers className="w-3.5 h-3.5" />
            Applies to {moduleMode.entityTypes.length}{" "}
            page{moduleMode.entityTypes.length === 1 ? "" : "s"} in{" "}
            {moduleMode.moduleLabel}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {moduleMode.entityTypes.map((et) => (
              <span
                key={et.type}
                className="inline-flex items-center text-[10px] font-semibold text-orange-700 bg-white border border-orange-200 px-2 py-0.5 rounded-full"
              >
                {et.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <FormSection title="Workflow Details">
        {moduleMode ? (
          <Field label="Workflow Name" required>
            <TextInput value={name} onChange={setName} placeholder="e.g. Purchase Approval" />
          </Field>
        ) : (
          <FormRow>
            <Field label="Workflow Name" required>
              <TextInput value={name} onChange={setName} placeholder="e.g. PO Approval" />
            </Field>
            <Field label="Entity Type" required>
              <SelectInput
                value={entityType}
                onChange={setEntityType}
                options={ENTITY_TYPE_OPTIONS}
                placeholder="Select entity type"
              />
            </Field>
          </FormRow>
        )}
        <CheckboxInput
          checked={isActive}
          onChange={setIsActive}
          label="Active (routes new documents through this workflow)"
        />
      </FormSection>

      <FormSection title="Approval Steps">
        <div className="space-y-2">
          {steps.map((s, i) => {
            const roleUsers = s.approverRole ? usersByRole.get(s.approverRole) ?? [] : [];
            const userOptions = roleUsers.map((u) => ({
              value: u.id,
              label: u.fullName || u.email,
            }));
            const pickedUser = s.approverUserId ? userById.get(s.approverUserId) : null;
            const pickedUserProjects: string[] =
              Array.isArray(pickedUser?.projectsAssigned) ? pickedUser.projectsAssigned : [];
            const pickedUserProjectNames = pickedUserProjects
              .map((pid) => projectNameById.get(pid) ?? pid)
              .filter(Boolean);
            return (
              <div
                key={i}
                className="p-3 border border-gray-200 rounded-lg bg-gray-50/50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400 w-4 shrink-0">
                    {i + 1}.
                  </span>
                  {/* `minmax(0, 1fr)` (instead of plain `1fr`) lets the
                      role and user pickers shrink below their content
                      min-width, otherwise long labels like "Site Admin /
                      Project Manager" push the user picker off the right
                      edge of the row. `min-w-0` on the flex child is
                      the matching half of that fix. */}
                  <div className="grid grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)] gap-2 flex-1 min-w-0">
                    <NumberInput
                      value={s.stepOrder}
                      onChange={(v) => updateStep(i, { stepOrder: v })}
                      placeholder="Order"
                      min={1}
                    />
                    <SelectInput
                      value={s.approverRole}
                      onChange={(v) =>
                        updateStep(i, { approverRole: v, approverUserId: "" })
                      }
                      options={ROLE_OPTIONS}
                      placeholder="Select role"
                    />
                    <SelectInput
                      value={s.approverUserId}
                      onChange={(v) => updateStep(i, { approverUserId: v })}
                      options={userOptions}
                      placeholder={
                        !s.approverRole
                          ? "Select role first"
                          : userOptions.length === 0
                            ? "No users in this role"
                            : "Select user"
                      }
                      disabled={!s.approverRole || userOptions.length === 0}
                      invalid={!!s.approverRole && !s.approverUserId && userOptions.length > 0}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    className="p-1 text-gray-300 hover:text-red-500 shrink-0"
                    aria-label="Remove step"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {pickedUser && (
                  <div className="pl-6 mt-2 text-[11px] text-gray-500 flex flex-wrap items-center gap-1">
                    <span className="font-medium text-gray-600">Assigned projects:</span>
                    {pickedUserProjectNames.length === 0 ? (
                      <span className="italic text-gray-400">
                        none (cross-site or unrestricted)
                      </span>
                    ) : (
                      pickedUserProjectNames.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-700"
                        >
                          {name}
                        </span>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addStep}
          className="mt-2 text-xs text-orange-600 font-semibold inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add Step
        </button>
      </FormSection>
    </FormDrawer>
  );
}
