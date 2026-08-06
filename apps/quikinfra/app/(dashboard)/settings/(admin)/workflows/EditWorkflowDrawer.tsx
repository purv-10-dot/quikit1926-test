"use client";

/**
 * Edit Workflow Drawer — used by the Edit button on the workflows list.
 *
 * Lets an admin rename a workflow, flip its active flag, change the entity
 * type, and add / remove / reorder approval steps. Save sends a PATCH to
 * `/api/settings/workflows/:id` which replaces the steps wholesale.
 */

import { toErrorMessage } from "@/lib/api/errors";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, NumberInput, SelectInput, CheckboxInput,
} from "@/components/FormDrawer";
import { useUpdateWorkflow, useUsers } from "@/hooks/use-approvals";
import { useProjects } from "@/hooks/use-masters";
import { getClientSelectableUserTypes, USER_TYPES } from "@/lib/rbac/user-types";

const ENTITY_TYPE_OPTIONS = [
  { value: "purchase_requisitions", label: "Purchase Requisitions" },
  { value: "purchase_indents", label: "Purchase Indents" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "rfqs", label: "RFQs" },
  { value: "grn", label: "GRN" },
  { value: "boq", label: "BOQ" },
  { value: "material_estimations", label: "Material Estimation" },
  { value: "work_order", label: "Work Orders" },
  { value: "dpr", label: "Daily Progress Report" },
  { value: "stock_reconciliation", label: "Stock Reconciliation" },
  { value: "good_return", label: "Good Return" },
  { value: "material_issues", label: "Material Issue" },
  { value: "gate_pass", label: "Gate Pass" },
  { value: "transfer", label: "Stock Transfer" },
  { value: "asset", label: "Asset Management" },
  { value: "rab", label: "RA Bills (Sub-Contractor)" },
  { value: "equipment_logs", label: "Equipment Log Book" },
  { value: "job_cards", label: "Maintenance" },
  { value: "equipment_transfers", label: "Deployment & Compliance" },
  { value: "hire_rent", label: "Hire & Rent" },
  { value: "equipment_fixed_assets", label: "Fixed Asset / Tools" },
];

const ROLE_OPTIONS = getClientSelectableUserTypes().map((t) => ({
  value: t.key,
  label: t.label,
}));

interface StepRow {
  stepOrder: string;
  approverRole: string;
  /**
   * Pool of users eligible to act on this step. Any one of them can
   * approve — the requester is excluded server-side at resolve time.
   * Empty array means the step has no concrete approvers yet (validation
   * blocks submit until at least one is picked).
   */
  approverUserIds: string[];
}

interface WfUserNode {
  id: string; status?: string; acceptedAt?: string | null; lastLoginAt?: string | null;
  userType: string; fullName: string; email: string; projectsAssigned?: string[];
}
interface WorkflowStepLike {
  stepOrder?: number | string; approverRole?: string; approverRoleId?: string;
  approverUserIds?: string[]; approverUserId?: string;
}
interface WorkflowLike {
  id?: string; name?: string; entityType?: string; isActive?: boolean;
  steps?: WorkflowStepLike[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  workflow: WorkflowLike | null;
}

export function EditWorkflowDrawer({ open, onClose, workflow }: Props) {
  const updateMutation = useUpdateWorkflow();
  const { data: usersResult } = useUsers();
  const { data: projectsResult } = useProjects();
  const allUsers = (usersResult?.data ?? []) as unknown as WfUserNode[];
  const allProjects = projectsResult?.data ?? [];

  // Look up a user by id so we can resolve their project assignments
  // when showing the read-only project list under a step.
  const userById = useMemo(() => {
    const map = new Map<string, WfUserNode>();
    for (const u of allUsers) map.set(u.id, u);
    return map;
  }, [allUsers]);

  // Project id → display name map for rendering the assignment chips.
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allProjects) map.set(p.id, (p as { siteName?: string | null }).siteName ?? p.name ?? p.code ?? p.id);
    return map;
  }, [allProjects]);

  // Group active, accepted users by userType so each step row can show
  // only the users matching its selected role without refetching per row.
  // Pending invitees (acceptedAt === null) are excluded — picking an
  // approver who hasn't logged in yet means the approval would block
  // forever waiting on a user who literally can't sign in. They reappear
  // in this dropdown the moment they complete the invite link.
  const usersByRole = useMemo(() => {
    const map = new Map<string, Array<{ id: string; fullName: string; email: string }>>();
    for (const u of allUsers) {
      if (u.status && u.status !== "active") continue;
      if (!u.acceptedAt && !u.lastLoginAt) continue;
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
      (workflow.steps ?? []).map((s) => {
        // Prefer the new array column; fall back to the legacy single
        // approverUserId so workflows saved before the migration keep
        // hydrating into the multi-select correctly.
        const ids: string[] = Array.isArray(s.approverUserIds) && s.approverUserIds.length
          ? s.approverUserIds
          : s.approverUserId
            ? [s.approverUserId]
            : [];
        return {
          stepOrder: String(s.stepOrder ?? 1),
          approverRole: s.approverRole ?? "",
          approverUserIds: ids,
        };
      }),
    );
    setError("");
  }, [workflow]);

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      { stepOrder: String(prev.length + 1), approverRole: "", approverUserIds: [] },
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

    // Every step needs a role and at least one user in the pool. Any
    // user in the pool can approve at resolve time (requester excluded).
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!;
      if (!s.approverRole) return setError(`Step ${i + 1}: select an approver role`);
      if (s.approverUserIds.length === 0) {
        return setError(`Step ${i + 1}: pick at least one approver user`);
      }
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
          // Send both the array (new) and the first user (legacy) so a
          // mid-deploy server still resolves a sensible approver if it
          // hasn't picked up the array column yet.
          approverUserId: s.approverUserIds[0] ?? null,
          approverUserIds: s.approverUserIds,
        })),
      });
      onClose();
    } catch (err: unknown) {
      setError(toErrorMessage(err, "Failed to save workflow"));
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
        {/* Inline tip — same hint as the create-workflow drawer so the
            "add Admin at the end" pattern is visible regardless of
            which entry point an admin used. */}
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-900 leading-relaxed">
          💡 <span className="font-semibold">Tip:</span> Add an{" "}
          <span className="font-semibold">Admin</span> step at the end if you want admin sign-off on every request. Otherwise the last step listed here is the final approver.
        </div>
        <div className="space-y-2">
          {steps.length === 0 && (
            <p className="text-xs text-gray-500 italic">
              No steps yet. Click "Add Step" to require approvers before documents flow through.
            </p>
          )}
          {steps.map((s, i) => {
            const roleUsers = s.approverRole ? usersByRole.get(s.approverRole) ?? [] : [];
            // Users already approving on any OTHER step. A single person
            // shouldn't sit twice in the same approval chain, so we hide
            // them from this step's picker entirely (the requester would
            // otherwise see the same name available again — the bug this
            // guards against).
            const usedElsewhere = new Set(
              steps.flatMap((other, j) => (j === i ? [] : other.approverUserIds)),
            );
            const selectableRoleUsers = roleUsers.filter(
              (u) => !usedElsewhere.has(u.id),
            );
            // Multi-approver pool is enabled for roles where multiple
            // peers commonly share a project and any of them can act:
            //   - USER: peer site workers (yash + bhavna both raise / approve).
            //   - ADMIN: most tenants run >1 Admin and any of them should
            //     be able to sign off on an Admin step.
            // HO_USER and SITE_ADMIN stay on the classic single-user
            // dropdown because those steps are typically pinned to one
            // specific person per project.
            const supportsMultiApprover =
              s.approverRole === USER_TYPES.USER ||
              s.approverRole === USER_TYPES.ADMIN;
            // Hide already-picked users from the multi-select dropdown
            // so the admin can't double-add the same person to the pool.
            const remainingOptions = selectableRoleUsers
              .filter((u) => !s.approverUserIds.includes(u.id))
              .map((u) => ({ value: u.id, label: u.fullName || u.email }));
            // Full option list for the single-select (non-USER) branch.
            const allUserOptions = selectableRoleUsers.map((u) => ({
              value: u.id,
              label: u.fullName || u.email,
            }));
            const pickedUsers = s.approverUserIds
              .map((id) => userById.get(id))
              .filter((u): u is WfUserNode => Boolean(u));
            // Union of every picked user's project assignments — gives the
            // admin a single chip strip showing all sites this step's pool
            // can cover. Deduped so two users on the same project don't
            // show the project twice.
            const projectIds = Array.from(
              new Set(
                pickedUsers.flatMap((u) =>
                  Array.isArray(u?.projectsAssigned) ? u.projectsAssigned : [],
                ),
              ),
            );
            const pickedUserProjectNames = projectIds
              .map((pid) => projectNameById.get(pid) ?? pid)
              .filter(Boolean);
            const addUser = (id: string) => {
              if (!id || s.approverUserIds.includes(id)) return;
              updateStep(i, { approverUserIds: [...s.approverUserIds, id] });
            };
            const removeUser = (id: string) =>
              updateStep(i, {
                approverUserIds: s.approverUserIds.filter((x) => x !== id),
              });
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
                        // Clear the pool when role changes — picked users
                        // may not belong to the new role.
                        updateStep(i, { approverRole: v, approverUserIds: [] })
                      }
                      options={ROLE_OPTIONS}
                      placeholder="Select role"
                    />
                    {supportsMultiApprover ? (
                      /* USER role: chip multi-select. The dropdown only
                         lists users not already in the pool; each pick
                         adds a chip and the field controlled to "" so
                         the placeholder reads "Add another" afterwards. */
                      <SelectInput
                        value=""
                        onChange={(v) => addUser(v)}
                        options={remainingOptions}
                        placeholder={
                          !s.approverRole
                            ? "Select role first"
                            : remainingOptions.length === 0
                              ? s.approverUserIds.length === 0
                                ? roleUsers.length === 0
                                  ? "No users in this role"
                                  : "All users used in other steps"
                                : "All users added"
                              : s.approverUserIds.length === 0
                                ? "Select user"
                                : "Add another"
                        }
                        disabled={!s.approverRole || remainingOptions.length === 0}
                        invalid={!!s.approverRole && s.approverUserIds.length === 0}
                      />
                    ) : (
                      /* Non-USER roles: classic single-user dropdown.
                         Stored as a 1-element approverUserIds array so
                         the resolver and back-end stay uniform. */
                      <SelectInput
                        value={s.approverUserIds[0] ?? ""}
                        onChange={(v) =>
                          updateStep(i, { approverUserIds: v ? [v] : [] })
                        }
                        options={allUserOptions}
                        placeholder={
                          !s.approverRole
                            ? "Select role first"
                            : allUserOptions.length === 0
                              ? roleUsers.length === 0
                                ? "No users in this role"
                                : "All users used in other steps"
                              : "Select user"
                        }
                        disabled={!s.approverRole || allUserOptions.length === 0}
                        invalid={
                          !!s.approverRole &&
                          s.approverUserIds.length === 0 &&
                          allUserOptions.length > 0
                        }
                      />
                    )}
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
                {/* Picked-user chips — USER role only. For non-USER
                    roles the single dropdown already shows the picked
                    user so chips would be redundant. */}
                {supportsMultiApprover && pickedUsers.length > 0 && (
                  <div className="pl-6 mt-2 flex flex-wrap gap-1.5">
                    {pickedUsers.map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-50 border border-accent-200 text-[11px] text-accent-700"
                      >
                        {u.fullName || u.email}
                        <button
                          type="button"
                          onClick={() => removeUser(u.id)}
                          className="text-accent-400 hover:text-accent-700"
                          aria-label={`Remove ${u.fullName || u.email}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {pickedUsers.length > 0 && (
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
          className="mt-2 text-xs text-accent-600 font-semibold inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add Step
        </button>
      </FormSection>
    </FormDrawer>
  );
}
