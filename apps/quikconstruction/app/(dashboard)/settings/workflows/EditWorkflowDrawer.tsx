"use client";

/**
 * Edit Workflow Drawer — used by the Edit button on the workflows list.
 *
 * Lets an admin rename a workflow, flip its active flag, change the entity
 * type, and add / remove / reorder approval steps. Save sends a PATCH to
 * `/api/settings/workflows/:id` which replaces the steps wholesale.
 */

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, NumberInput, SelectInput, CheckboxInput,
} from "@/components/FormDrawer";
import { useUpdateWorkflow, useUsers } from "@/hooks/use-approvals";
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

interface Props {
  open: boolean;
  onClose: () => void;
  workflow: any | null;
}

export function EditWorkflowDrawer({ open, onClose, workflow }: Props) {
  const updateMutation = useUpdateWorkflow();
  const { data: usersResult } = useUsers();
  const { data: projectsResult } = useProjects();
  const allUsers = usersResult?.data ?? [];
  const allProjects = projectsResult?.data ?? [];

  // Look up a user by id so we can resolve their project assignments
  // when showing the read-only project list under a step.
  const userById = useMemo(() => {
    const map = new Map<string, any>();
    for (const u of allUsers) map.set(u.id, u);
    return map;
  }, [allUsers]);

  // Project id → display name map for rendering the assignment chips.
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allProjects) map.set(p.id, p.siteName ?? p.name ?? p.code ?? p.id);
    return map;
  }, [allProjects]);

  // Group active users by userType so each step row can show only the
  // users matching its selected role without refetching per row.
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
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [error, setError] = useState("");

  // Hydrate the form whenever a new workflow is passed in. We do this in
  // an effect (rather than useState initializer) so clicking Edit on a
  // different row refills the form instead of keeping stale state.
  useEffect(() => {
    if (!workflow) return;
    setName(workflow.name ?? "");
    setEntityType(workflow.entityType ?? "");
    setIsActive(!!workflow.isActive);
    setSteps(
      (workflow.steps ?? []).map((s: any) => ({
        stepOrder: String(s.stepOrder ?? 1),
        approverRole: s.approverRole ?? "",
        approverUserId: s.approverUserId ?? "",
      })),
    );
    setError("");
  }, [workflow]);

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
    if (!workflow?.id) return;
    if (!name.trim()) return setError("Workflow name is required");
    if (!entityType) return setError("Entity type is required");
    if (steps.length === 0) return setError("Add at least one approval step");

    // Every step needs both a role and a pinned user — see the matching
    // validation in NewWorkflowDrawer for why role-only steps aren't
    // allowed.
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!;
      if (!s.approverRole) return setError(`Step ${i + 1}: select an approver role`);
      if (!s.approverUserId) return setError(`Step ${i + 1}: select an approver user`);
    }

    try {
      await updateMutation.mutateAsync({
        id: workflow.id,
        name: name.trim(),
        entityType,
        isActive,
        steps: steps.map((s) => ({
          stepOrder: Number(s.stepOrder) || 1,
          approverRole: s.approverRole,
          approverUserId: s.approverUserId,
        })),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save workflow");
    }
  };

  if (!workflow) return null;

  return (
    <FormDrawer
      open={open}
      onClose={onClose}
      title="Edit Workflow"
      subtitle="Update name, entity type, active state, and approval steps"
      width="2xl"
      onSubmit={handleSubmit}
      loading={updateMutation.isPending}
      submitLabel="Save Changes"
    >
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 mb-3">
          {error}
        </div>
      )}

      <FormSection title="Workflow Details">
        <FormRow>
          <Field label="Workflow Name" required>
            <TextInput value={name} onChange={setName} placeholder="e.g. PR Approval" />
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
        <CheckboxInput
          checked={isActive}
          onChange={setIsActive}
          label="Active (routes new documents through this workflow)"
        />
      </FormSection>

      <FormSection title="Approval Steps">
        <div className="space-y-2">
          {steps.length === 0 && (
            <p className="text-xs text-gray-500 italic">
              No steps yet. Click "Add Step" to require approvers before documents flow through.
            </p>
          )}
          {steps.map((s, i) => {
            const roleUsers = s.approverRole ? usersByRole.get(s.approverRole) ?? [] : [];
            const userOptions = roleUsers.map((u) => ({
              value: u.id,
              label: u.fullName || u.email,
            }));
            // When a specific user is pinned, surface their project scope
            // so the admin configuring the flow can see which sites this
            // approver covers. Display-only — assignments are edited on
            // the User form.
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
                  {/* `minmax(0, 1fr)` lets the role / user pickers
                      shrink below their content min-width — without it,
                      long role labels like "Site Admin / Project
                      Manager" push the user picker off the right edge.
                      `min-w-0` on the flex child is the matching half. */}
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
                        // Clear the user when role changes — the previously
                        // picked user may not belong to the new role.
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
