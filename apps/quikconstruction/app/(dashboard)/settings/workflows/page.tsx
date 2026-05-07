"use client";

/**
 * Approval Workflows — module-grouped layout.
 *
 * Each row card represents a *module* (Purchase, Projects, Store) and
 * its workflow is a single definition that applies to every document
 * type in that module. Under the hood we still write one workflow row
 * per entity type (so existing per-entityType lookups in the approval
 * engine keep working unchanged) but the admin sees one config block
 * per module instead of one per entity.
 *
 * The "Configure" / "Edit" buttons open `NewWorkflowDrawer` in
 * module-mode: the drawer hides the single Entity Type dropdown,
 * surfaces a covered-pages strip, and on save creates one workflow
 * row per entity type (replacing existing rows for that module
 * during Edit).
 */

import { useState } from "react";
import {
  Trash2, Pencil, Plus, CheckCircle2, CircleDashed, Layers,
  ShoppingCart, FolderKanban, Warehouse,
} from "lucide-react";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { useWorkflows, useDeleteWorkflow } from "@/hooks/use-approvals";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import dynamic from "next/dynamic";
const NewWorkflowDrawer = dynamic(
  () => import("./NewWorkflowDrawer").then((m) => m.NewWorkflowDrawer),
  { ssr: false },
);

interface ModuleEntity { type: string; label: string }
interface ModuleGroup {
  key: string;
  label: string;
  description: string;
  iconComponent: React.ComponentType<{ className?: string }>;
  entities: ModuleEntity[];
}

// One source of truth for how the document types group into modules.
// Order = the order the cards render. Edit here when a new document
// type is added to the system, NOT in two places.
const MODULE_GROUPS: ModuleGroup[] = [
  {
    key: "purchase",
    label: "Purchase",
    description: "PR → Indent → RFQ → PO",
    iconComponent: ShoppingCart,
    entities: [
      { type: "purchase_requisitions", label: "Purchase Requisitions" },
      { type: "purchase_indents", label: "Purchase Indents" },
      { type: "rfqs", label: "RFQs" },
      { type: "purchase_order", label: "Purchase Order" },
    ],
  },
  {
    key: "projects",
    label: "Projects",
    description: "Estimation, Work Orders, DPR",
    iconComponent: FolderKanban,
    entities: [
      { type: "material_estimations", label: "Material Estimation" },
      { type: "work_order", label: "Work Orders" },
      { type: "dpr", label: "Daily Progress Report" },
    ],
  },
  {
    key: "store",
    label: "Store",
    description: "GRN, Issue, Gate Pass, Transfer, Recon, Returns",
    iconComponent: Warehouse,
    entities: [
      // GRN sits with Store because the goods-receipt event is a
      // store-side operation (it's where stock enters the warehouse),
      // not part of the procurement approval chain.
      { type: "grn", label: "Goods Receipt" },
      { type: "stock_reconciliation", label: "Stock Reconciliation" },
      { type: "good_return", label: "Good Return" },
      { type: "material_issues", label: "Material Issue" },
      { type: "gate_pass", label: "Gate Pass" },
      { type: "transfer", label: "Stock Transfer" },
    ],
  },
];

interface DrawerState {
  module: ModuleGroup;
  prefill?: {
    name: string;
    isActive: boolean;
    steps: Array<{ stepOrder: string; approverRole: string; approverUserId: string }>;
  };
  replaceIds?: string[];
}

export default function WorkflowsPage() {
  const { data: result } = useWorkflows();
  const workflows = result?.data ?? [];
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModuleGroup | null>(null);
  const deleteMutation = useDeleteWorkflow();

  // Index workflows by entityType so the per-card lookups are O(1).
  const workflowMap = new Map<string, any>();
  workflows.forEach((wf: any) => workflowMap.set(wf.entityType, wf));

  // Top-of-page summary counts. We count modules where ALL entities
  // have a workflow as "configured"; partials are intentionally not
  // counted as configured because the module workflow is a single
  // logical unit — half-applied is half-broken.
  const totalEntities = MODULE_GROUPS.reduce((sum, m) => sum + m.entities.length, 0);
  const configuredEntities = workflows.length;

  const handleConfigure = (mod: ModuleGroup) => {
    setDrawerState({ module: mod });
  };

  const handleEdit = (mod: ModuleGroup) => {
    // Pull the first existing workflow in this module as the template
    // for prefill. The Save flow in the drawer will delete every
    // existing workflow under this module and recreate fresh rows for
    // every entity, so even if some entities had divergent configs
    // before, we end up with a single canonical module workflow.
    const existing = mod.entities
      .map((et) => workflowMap.get(et.type))
      .filter(Boolean);
    const seed = existing[0];
    setDrawerState({
      module: mod,
      prefill: {
        name: seed?.name ?? "",
        isActive: seed?.isActive ?? true,
        steps: (seed?.steps ?? []).map((s: any) => ({
          stepOrder: String(s.stepOrder ?? 1),
          approverRole: s.approverRole ?? s.approverRoleId ?? "",
          approverUserId: s.approverUserId ?? "",
        })),
      },
      replaceIds: existing.map((wf: any) => wf.id),
    });
  };

  const handleDeleteAll = async () => {
    if (!deleteTarget) return;
    const ids = deleteTarget.entities
      .map((et) => workflowMap.get(et.type))
      .filter(Boolean)
      .map((wf: any) => wf.id);
    for (const id of ids) {
      // Sequential so a failure halfway through doesn't fan out into
      // N parallel error toasts; the loop stops at the first throw.
      // eslint-disable-next-line no-await-in-loop
      await deleteMutation.mutateAsync(id);
    }
    setDeleteTarget(null);
  };

  return (
    <>
      <PageHeader
        title="Approval Workflows"
        subtitle="One workflow per module — applied to every page inside that module"
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Workflows" }]}
      />

      <PageContainer>
        {/* Summary banner — counts entity-level coverage so the admin
            sees how much of the approval surface is wired up. */}
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {configuredEntities} of {totalEntities} document types covered
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Configure once per module — the same routing rule is then applied
                to every page in that module. Submissions without a workflow are
                auto-rejected on submit.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
              <CheckCircle2 className="w-3 h-3" /> {configuredEntities} Active
            </span>
            <span className="inline-flex items-center gap-1 text-gray-600 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full font-semibold">
              <CircleDashed className="w-3 h-3" />{" "}
              {totalEntities - configuredEntities} Pending
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {MODULE_GROUPS.map((mod) => {
            const Icon = mod.iconComponent;
            const entityWorkflows = mod.entities.map((et) => ({
              entity: et,
              workflow: workflowMap.get(et.type) as any | undefined,
            }));
            const configuredCount = entityWorkflows.filter((e) => e.workflow).length;
            const totalCount = entityWorkflows.length;
            const fullyConfigured = configuredCount === totalCount;
            const partial = configuredCount > 0 && configuredCount < totalCount;
            const noneConfigured = configuredCount === 0;
            // Use the first non-empty workflow's name to label the
            // module's config — typically all rows in a module share
            // the same name because they were saved together. If the
            // user previously configured per-entity with different
            // names, we just show the first one (Edit will then
            // unify them on next save).
            const displayName = entityWorkflows.find((e) => e.workflow)?.workflow?.name;
            const stepCount = entityWorkflows.find((e) => e.workflow)?.workflow?.steps?.length ?? 0;

            return (
              <div
                key={mod.key}
                className={`bg-white rounded-xl border shadow-sm transition-colors ${
                  fullyConfigured
                    ? "border-emerald-200"
                    : partial
                      ? "border-amber-200"
                      : "border-dashed border-gray-300"
                }`}
              >
                <div className="p-5">
                  {/* Header row: icon + module label + status pill + actions */}
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          fullyConfigured
                            ? "bg-emerald-50 text-emerald-600"
                            : partial
                              ? "bg-amber-50 text-amber-600"
                              : "bg-gray-50 text-gray-500"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-gray-900">
                            {mod.label}
                          </h3>
                          <span
                            className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                              fullyConfigured
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : partial
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-gray-50 text-gray-500 border-gray-200"
                            }`}
                          >
                            {fullyConfigured
                              ? "All Configured"
                              : partial
                                ? `Partial · ${configuredCount}/${totalCount}`
                                : "Not Configured"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {mod.description}
                        </p>
                        {displayName && (
                          <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-600">
                            <span className="font-semibold text-gray-800">{displayName}</span>
                            <span className="text-gray-300">·</span>
                            <span>
                              <span className="font-bold text-gray-900 tabular-nums">{stepCount}</span>{" "}
                              {stepCount === 1 ? "step" : "steps"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {noneConfigured ? (
                        <button
                          type="button"
                          onClick={() => handleConfigure(mod)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" /> Configure Workflow
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEdit(mod)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(mod)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
                            title="Delete workflow for entire module"
                            aria-label="Delete module workflow"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Pages strip — list every entity in the module so
                      the admin sees exactly what the workflow rule
                      governs. Configured entries get a green tick; the
                      rest a faint dashed circle. */}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                      Pages this workflow applies to
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {entityWorkflows.map(({ entity, workflow }) => {
                        const isOn = !!workflow;
                        return (
                          <span
                            key={entity.type}
                            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border ${
                              isOn
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-gray-50 text-gray-500 border-gray-200 border-dashed"
                            }`}
                          >
                            {isOn ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <CircleDashed className="w-3 h-3" />
                            )}
                            {entity.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </PageContainer>

      <NewWorkflowDrawer
        open={drawerState !== null}
        onClose={() => setDrawerState(null)}
        moduleMode={
          drawerState
            ? {
                moduleLabel: drawerState.module.label,
                entityTypes: drawerState.module.entities,
                prefill: drawerState.prefill,
                replaceIds: drawerState.replaceIds,
              }
            : undefined
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => { if (!deleteMutation.isPending) setDeleteTarget(null); }}
        onConfirm={handleDeleteAll}
        loading={deleteMutation.isPending}
        tone="danger"
        title="Delete Module Workflow"
        confirmLabel="Delete"
        message={
          deleteTarget ? (
            <>
              Remove the approval workflow from{" "}
              <span className="font-semibold text-gray-900">{deleteTarget.label}</span>?
              <br />
              This deletes the routing rule for{" "}
              <span className="font-medium">
                {deleteTarget.entities.map((e) => e.label).join(", ")}
              </span>
              . In-flight approval instances are not affected.
            </>
          ) : null
        }
      />
    </>
  );
}
