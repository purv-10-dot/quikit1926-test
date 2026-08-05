"use client";

/**
 * Workflow Drawer — handles both creation and editing. Passing `prefill`
 * (plus `moduleMode`) seeds the form from an existing workflow and switches
 * the title to "Edit …" and the submit label to "Save Changes", so New and
 * Edit share one form: per-step role select + role-filtered user picker.
 */

import { toErrorMessage } from "@/lib/api/errors";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Layers,
  AlertTriangle,
  AlertOctagon,
  Info,
  X,
} from "lucide-react";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, SelectInput,
} from "@/components/FormDrawer";
import { useCreateWorkflow, useDeleteWorkflow, useUpdateWorkflow, useUsers } from "@/hooks/use-approvals";
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
   * approve at resolve time; the requester is excluded server-side.
   */
  approverUserIds: string[];
}

interface WfUserNode {
  id: string; status?: string; acceptedAt?: string | null; lastLoginAt?: string | null;
  userType: string; fullName: string; email: string; projectsAssigned?: string[];
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
    steps: Array<{ stepOrder: string; approverRole: string; approverUserIds: string[] }>;
  };
  /** Optional list of existing workflow ids in this module that should
   *  be deleted before saving — used by the "Edit module" flow which
   *  is a replace-all. Empty / omitted = pure create. */
  replaceIds?: string[];
  /** Project scope for the created/replaced rows. `null` (or omitted)
   *  saves them as the tenant-wide Default workflow. A project id
   *  scopes the rows to that project — submitForApproval looks for a
   *  project row first and falls back to Default. */
  projectId?: string | null;
  /** Friendly label for the project the save will be scoped to. Shown
   *  in the drawer banner so the admin can't mix up scopes. */
  projectLabel?: string;
  /** Requests currently mid-approval on the workflow being edited, bucketed by
   *  the step they are waiting at. Drives two warnings: a general "work is in
   *  flight" note, and a live alert when the current step count would strand
   *  requests parked beyond it. */
  pendingByStep?: Array<{ stepOrder: number; count: number; atRisk: number }>;
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
  const updateMutation = useUpdateWorkflow();
  const { data: usersResult } = useUsers();
  const { data: projectsResult } = useProjects();
  const allUsers = (usersResult?.data ?? []) as unknown as WfUserNode[];
  const allProjects = projectsResult?.data ?? [];

  const userById = useMemo(() => {
    const map = new Map<string, WfUserNode>();
    for (const u of allUsers) map.set(u.id, u);
    return map;
  }, [allUsers]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allProjects) map.set(p.id, (p as { siteName?: string | null }).siteName ?? p.name ?? p.code ?? p.id);
    return map;
  }, [allProjects]);

  // Group accepted, active users by userType. Pending invitees (no
  // `acceptedAt`) are intentionally excluded — picking them as an
  // approver would deadlock the workflow until they accept the invite,
  // because the server-side `canActOnStep` rejects users who haven't
  // logged in. They reappear here as soon as the invite is accepted.
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
  const [steps, setSteps] = useState<StepRow[]>([
    { stepOrder: "1", approverRole: "", approverUserIds: [] },
  ]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (moduleMode?.prefill) {
      setName(moduleMode.prefill.name);
      setIsActive(moduleMode.prefill.isActive);
      const prefillSteps =
        moduleMode.prefill.steps.length > 0
          ? moduleMode.prefill.steps.map((s, i) => ({
              ...s,
              stepOrder: String(i + 1),
            }))
          : [{ stepOrder: "1", approverRole: "", approverUserIds: [] }];
      setSteps(prefillSteps);
    } else {
      setName("");
      setIsActive(true);
      setSteps([{ stepOrder: "1", approverRole: "", approverUserIds: [] }]);
    }
    // In module mode the single entity dropdown is hidden, but we still
    // clear the field so it doesn't carry stale state from a previous
    // single-entity open.
    setEntityType(moduleMode ? "" : (defaultEntityType ?? ""));
    setError("");
  }, [open, defaultEntityType, moduleMode]);

  // Step order is always derived from array position so it stays sequential
  // (1, 2, 3, …) — admins can't introduce gaps or duplicates that would
  // break the approval engine's `stepOrder > current` lookup.
  const resequence = (rows: StepRow[]): StepRow[] =>
    rows.map((s, i) => ({ ...s, stepOrder: String(i + 1) }));

  const addStep = () =>
    setSteps((prev) =>
      resequence([
        ...prev,
        { stepOrder: "", approverRole: "", approverUserIds: [] },
      ]),
    );

  const removeStep = (idx: number) =>
    setSteps((prev) => resequence(prev.filter((_, i) => i !== idx)));

  const updateStep = (idx: number, patch: Partial<StepRow>) =>
    setSteps((prev) =>
      resequence(prev.map((s, i) => (i === idx ? { ...s, ...patch } : s))),
    );

  // Removing a step resequences the rest, so the saved workflow always runs
  // 1..N. A request waiting beyond N therefore has no step to sit on once this
  // saves — that, not "which row did you click delete on", is the real risk.
  const pendingByStep = moduleMode?.pendingByStep ?? [];
  const pendingTotal = pendingByStep.reduce((sum, p) => sum + p.count, 0);

  // Only requests without a step snapshot are affected by an edit here — the
  // rest carry their own chain and cannot be changed or stranded.
  const atRiskByStep = pendingByStep.filter((p) => p.atRisk > 0);
  const atRiskTotal = atRiskByStep.reduce((sum, p) => sum + p.atRisk, 0);
  const strandedRequests = atRiskByStep
    .filter((p) => p.stepOrder > steps.length)
    .map((p) => ({ stepOrder: p.stepOrder, count: p.atRisk }));
  const strandedTotal = strandedRequests.reduce((sum, p) => sum + p.count, 0);
  /** At-risk buckets carrying their at-risk counts, not their row totals. */
  const strandedSource = atRiskByStep.map((p) => ({
    stepOrder: p.stepOrder,
    count: p.atRisk,
  }));

  /** "step 2" · "step 2 (3 requests)" · "step 1 (2 requests) and step 3" */
  const formatStepList = (
    buckets: Array<{ stepOrder: number; count: number }>,
  ): string => {
    const parts = buckets.map(
      (p) => `step ${p.stepOrder}` + (p.count > 1 ? ` (${p.count} requests)` : ""),
    );
    if (parts.length <= 1) return parts[0] ?? "";
    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  };

  const handleSubmit = async () => {
    setError("");
    if (!name.trim()) return setError("Workflow name is required");
    if (!moduleMode && !entityType) return setError("Entity type is required");
    if (steps.length === 0) return setError("Add at least one approval step");

    // Every step needs a role and at least one user in the pool. A bare
    // role-only step routes to whoever in the org has that role, which
    // is too loose — admins want named approvers per step. The resolver
    // picks the first member of the pool minus the requester at submit
    // time, so listing all eligible peers is the right shape here.
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!;
      if (!s.approverRole) return setError(`Step ${i + 1}: select an approver role`);
      if (s.approverUserIds.length === 0) {
        return setError(`Step ${i + 1}: pick at least one approver user`);
      }
    }

    const stepPayload = steps.map((s) => ({
      stepOrder: Number(s.stepOrder) || 1,
      approverRole: s.approverRole,
      // Send both — the array is the new source of truth, the first id
      // keeps legacy resolvers working during the deploy window.
      approverUserId: s.approverUserIds[0] ?? null,
      approverUserIds: s.approverUserIds,
    }));

    try {
      if (moduleMode) {
        // Edit flow: update existing rows in place rather than
        // delete+create. Hard-deleting a workflow that already has
        // approval instances trips the non-cascading FK and aborts the
        // save; updating preserves the workflowId so history stays
        // intact. Per-page edit is 1:1 (one replaceId per entityType),
        // so we pair them by index. Extra entityTypes (rare — e.g. a
        // module that grew a new page) get created fresh.
        const replaceIds = moduleMode.replaceIds ?? [];
        for (let i = 0; i < moduleMode.entityTypes.length; i++) {
          const et = moduleMode.entityTypes[i]!;
          const existingId = replaceIds[i];
          if (existingId) {
            await updateMutation.mutateAsync({
              id: existingId,
              name: name.trim(),
              entityType: et.type,
              projectId: moduleMode.projectId ?? null,
              isActive,
              steps: stepPayload,
            });
          } else {
            await createMutation.mutateAsync({
              name: name.trim(),
              entityType: et.type,
              projectId: moduleMode.projectId ?? null,
              isActive,
              steps: stepPayload,
            });
          }
        }
        // Any replaceIds that no longer have a matching entityType were
        // removed from the module — delete them. Falls back to a clear
        // error if the row already has approval history (preserve audit).
        for (let i = moduleMode.entityTypes.length; i < replaceIds.length; i++) {
          await deleteMutation.mutateAsync(replaceIds[i]!);
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
    } catch (err: unknown) {
      setError(toErrorMessage(err, "Failed to create workflow"));
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
        // The title already names the module/page, so the subtitle carries only
        // the scope. Repeating the page name here (and again in the strip below)
        // read as a duplicate.
        moduleMode
          ? (moduleMode.projectId
              ? `Project — ${moduleMode.projectLabel ?? "(selected)"}`
              : "Default — applies to every project unless overridden") +
            (moduleMode.entityTypes.length > 1
              ? ` · ${moduleMode.entityTypes.length} pages`
              : "")
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

      {/* Covered pages strip — only when this one definition fans out across
          several pages, where the chip list is the only place that shows which.
          For the single-page case the title and subtitle already say it, so the
          strip would just repeat the page name a third time. */}
      {moduleMode && moduleMode.entityTypes.length > 1 && (
        <div className="bg-accent-50 border border-accent-200 rounded-lg px-4 py-3 mb-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-accent-800 mb-2">
            <Layers className="w-3.5 h-3.5" />
            One workflow, saved to each of these pages
          </div>
          <div className="flex flex-wrap gap-1.5">
            {moduleMode.entityTypes.map((et) => (
              <span
                key={et.type}
                className="inline-flex items-center text-[10px] font-semibold text-accent-700 bg-white border border-accent-200 px-2 py-0.5 rounded-full"
              >
                {et.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Two levels. The amber note is informational: work is in flight, edit
          carefully. The red one is live and specific — the current step count
          would leave named requests on a step that no longer exists. */}
      {pendingTotal > 0 && strandedRequests.length === 0 && (
        <div
          className={
            atRiskTotal > 0
              ? "mb-4 flex gap-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-4 ring-1 ring-amber-200/60"
              : "mb-4 flex gap-3 rounded-lg border-l-4 border-slate-300 bg-slate-50 p-4 ring-1 ring-slate-200/60"
          }
        >
          {atRiskTotal > 0 ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          ) : (
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          )}
          <div>
            <p
              className={
                atRiskTotal > 0
                  ? "text-sm font-semibold text-amber-900"
                  : "text-sm font-semibold text-slate-800"
              }
            >
              {pendingTotal} request{pendingTotal === 1 ? "" : "s"}{" "}
              {pendingTotal === 1 ? "is" : "are"} already moving through this
              approval chain
            </p>
            {atRiskTotal > 0 ? (
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                {atRiskTotal} of them {atRiskTotal === 1 ? "is" : "are"} waiting at{" "}
                {formatStepList(strandedSource)} and{" "}
                <span className="font-semibold">
                  still follow this workflow live
                </span>
                . Editing the steps here breaks the chain they were raised under —
                swap a person and the new person becomes their approver; delete a
                step and the request is left with no approver at all, and only an
                admin can close it.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Waiting at {formatStepList(pendingByStep)}. They keep the steps
                they were submitted with, so your changes here apply to{" "}
                <span className="font-semibold">new requests only</span> — nothing
                in flight is affected.
              </p>
            )}
          </div>
        </div>
      )}

      {strandedRequests.length > 0 && (
        <div className="mb-4 flex gap-3 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 ring-1 ring-red-200/60">
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-semibold text-red-900">
              Saving now will leave {strandedTotal} request
              {strandedTotal === 1 ? "" : "s"} with no approver
            </p>
            <p className="mt-1 text-xs leading-relaxed text-red-800">
              {strandedTotal === 1 ? "A request is" : "Requests are"} waiting at{" "}
              {formatStepList(strandedRequests)}, but this workflow will only have{" "}
              {steps.length} step{steps.length === 1 ? "" : "s"} after you save.
              That step disappears, so no approver will be able to act on{" "}
              {strandedTotal === 1 ? "it" : "them"} — it will sit as Pending until
              an admin closes it from the request page.
            </p>
            <p className="mt-2 text-xs font-semibold text-red-900">
              Add the step back, or get{" "}
              {strandedTotal === 1 ? "that request" : "those requests"} approved
              first.
            </p>
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
      </FormSection>

      <FormSection title="Approval Steps">
        {/* Inline tip — surfaces the "add Admin at the end" pattern we
            don't auto-append. Cheap UX hint so admins building their
            first workflow don't forget to put themselves at the bottom
            if they want final sign-off on every request. */}
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-900 leading-relaxed">
          💡 <span className="font-semibold">Tip:</span> Add an{" "}
          <span className="font-semibold">Admin</span> step at the end if you want admin sign-off on every request. Otherwise the last step you add here is the final approver.
        </div>
        <div className="space-y-2">
          {steps.map((s, i) => {
            const roleUsers = s.approverRole ? usersByRole.get(s.approverRole) ?? [] : [];
            // Users already approving on any OTHER step. A single person
            // shouldn't sit twice in the same approval chain, so we hide
            // them from this step's picker entirely.
            const usedElsewhere = new Set(
              steps.flatMap((other, j) => (j === i ? [] : other.approverUserIds)),
            );
            const selectableRoleUsers = roleUsers.filter(
              (u) => !usedElsewhere.has(u.id),
            );
            // Pool semantics (multi-select chips) apply to the roles
            // where multiple peers commonly share work:
            //   - USER: peer site workers (yash + bhavna both raise / approve).
            //   - ADMIN: most tenants run >1 Admin and any can sign off.
            // HO_USER and SITE_ADMIN keep the classic single dropdown
            // because their steps are typically pinned to one person.
            const supportsMultiApprover =
              s.approverRole === USER_TYPES.USER ||
              s.approverRole === USER_TYPES.ADMIN;
            // Only show users not yet added — prevents double-adding to
            // the multi-select pool.
            const remainingOptions = selectableRoleUsers
              .filter((u) => !s.approverUserIds.includes(u.id))
              .map((u) => ({ value: u.id, label: u.fullName || u.email }));
            // Full option list for the single-select (non-USER) branch.
            const allUserOptions = selectableRoleUsers.map((u) => ({
              value: u.id,
              label: u.fullName || u.email,
            }));
            // Human label for the empty-state hint — falls back to the
            // raw key (e.g. "SITE_ADMIN") if the role is somehow not in
            // ROLE_OPTIONS, which should never happen but keeps the
            // hint from showing `undefined`.
            const roleLabel =
              ROLE_OPTIONS.find((r) => r.value === s.approverRole)?.label ??
              s.approverRole;
            const showNoUsersHint =
              !!s.approverRole && roleUsers.length === 0;
            const pickedUsers = s.approverUserIds
              .map((id) => userById.get(id))
              .filter((u): u is WfUserNode => Boolean(u));
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
                  {/* `minmax(0, 1fr)` (instead of plain `1fr`) lets the
                      role and user pickers shrink below their content
                      min-width, otherwise long labels like "Site Admin /
                      Project Manager" push the user picker off the right
                      edge of the row. `min-w-0` on the flex child is
                      the matching half of that fix. */}
                  <div className="grid grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)] gap-2 flex-1 min-w-0">
                    <input
                      type="text"
                      value={s.stepOrder}
                      readOnly
                      tabIndex={-1}
                      aria-label="Step order"
                      title="Step order is set automatically by position"
                      className="w-full px-3 py-2 text-sm font-semibold text-gray-700 text-center bg-gray-100 border border-gray-200 rounded-lg cursor-default focus:outline-none"
                    />
                    <SelectInput
                      value={s.approverRole}
                      onChange={(v) =>
                        updateStep(i, { approverRole: v, approverUserIds: [] })
                      }
                      options={ROLE_OPTIONS}
                      placeholder="Select role"
                    />
                    {supportsMultiApprover ? (
                      /* USER role: chip multi-select. Already-added
                         users disappear from the option list to avoid
                         duplicate picks; the field is controlled to ""
                         so the placeholder updates after each add. */
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
                {showNoUsersHint && (
                  // Surfaced inline so the admin doesn't have to open
                  // the disabled "No users in this role" dropdown to
                  // realise nothing is selectable. Includes the path
                  // to fix (Settings → Users) so the next click is
                  // obvious.
                  <div className="pl-6 mt-2 flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
                    <div className="leading-snug">
                      No active user has the{" "}
                      <span className="font-semibold">{roleLabel}</span> role.
                      Assign this role to someone in{" "}
                      <a
                        href="/settings/users"
                        className="font-semibold underline decoration-amber-400 underline-offset-2 hover:text-amber-900"
                      >
                        Settings → Users
                      </a>{" "}
                      first, then come back and pick them here.
                    </div>
                  </div>
                )}
                {/* Picked-user chips — USER role only. Non-USER roles
                    surface the single pick inline in the dropdown, so
                    a chip strip would just be redundant noise. */}
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
