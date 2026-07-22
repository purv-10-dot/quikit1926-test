"use client";

/**
 * Approval Workflows — module-grouped layout, project-scoped via tabs.
 *
 * The page now has two axes:
 *   1. The horizontal tab strip at the top picks the *scope*:
 *      "Default" (tenant-wide fallback) or a specific project.
 *   2. The module cards underneath show how each module is configured
 *      *for that scope*. Project tabs only show rows where
 *      `projectId === <selectedProject>`; the Default tab only shows
 *      rows where `projectId IS NULL`.
 *
 * On submit, the resolver in `src/lib/approvals/submit-for-approval.ts`
 * looks for a project-scoped workflow first and falls back to Default
 * when the project has no override. So an admin can configure once on
 * the Default tab and only override the modules that need different
 * routing per project.
 *
 * Tabs are decorated with a small "n" badge when a project carries one
 * or more overrides — at-a-glance signal of which projects diverge from Default
 * without having to click into each tab.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil, Plus, CheckCircle2, CircleDashed, Layers, ChevronDown,
  ShoppingCart, FolderKanban, Warehouse, Search, X, ArrowRight, Workflow,
  CreditCard, Hammer,
} from "lucide-react";
import Link from "next/link";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { useWorkflows } from "@/hooks/use-approvals";
import { useProjects } from "@/hooks/use-masters";
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
// Order = the order the cards render, and it mirrors the sidebar
// (CONSTRUCTION_NAV in QuikInfraShell.tsx): Projects → Purchase → Store
// → Machinery & Equipment → Finance. Keep this in step with the sidebar
// so the workflow cards read in the same hierarchy users navigate by.
// Edit here when a new document type is added to the system, NOT in two places.
const MODULE_GROUPS: ModuleGroup[] = [
  {
    key: "projects",
    label: "Projects",
    description: "BOQ, Estimation, Work Orders, DPR",
    iconComponent: FolderKanban,
    entities: [
      { type: "boq", label: "BOQ" },
      { type: "material_estimations", label: "Material Estimation" },
      { type: "work_order", label: "Work Orders" },
      { type: "dpr", label: "Daily Progress Report" },
    ],
  },
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
    key: "store",
    label: "Store",
    description: "GRN, Issue, Gate Pass, Transfer, Recon, Returns, Assets",
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
      { type: "asset", label: "Asset Management" },
    ],
  },
  {
    key: "machinery_equipment",
    label: "Machinery & Equipment",
    description: "Log Book, Maintenance, Deployment, Hire & Rent, Fixed Assets",
    iconComponent: Hammer,
    entities: [
      { type: "equipment_logs", label: "Equipment Log Book" },
      { type: "job_cards", label: "Maintenance" },
      { type: "equipment_transfers", label: "Deployment & Compliance" },
      { type: "hire_rent", label: "Hire & Rent" },
      { type: "equipment_fixed_assets", label: "Fixed Asset / Tools" },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    description: "RA Bills (Sub-Contractor)",
    iconComponent: CreditCard,
    entities: [
      // entityType "rab" must match the RA Bill submit/approve routes
      // (submitForApproval({ entityType: "rab" })).
      { type: "rab", label: "RA Bills (Sub-Contractor)" },
    ],
  },
];

// Workflows are configured strictly per project — no tenant-wide Default
// scope. The scope state holds a `CnProject.id`, or `null` when no
// projects exist yet (the page renders an empty-state in that case).
type Scope = string | null;

interface DrawerState {
  // The module the drawer is acting on. `module.entities` is always
  // filtered to a single entry — workflows are configured per page,
  // never bulk-applied across a module.
  module: ModuleGroup;
  // Label of the page being configured (e.g. "Purchase Order"). Drives
  // the drawer title.
  pageLabel: string;
  // Parent module label, shown as a breadcrumb prefix in the title so
  // the admin still sees the Purchase / Projects / Store grouping.
  moduleLabel: string;
  // The scope the drawer is operating on — null = Default, else projectId.
  scopeProjectId: string | null;
  scopeLabel: string;
  prefill?: {
    name: string;
    isActive: boolean;
    // Mirrors NewWorkflowDrawer.ModuleMode.prefill.steps — the per-step
    // approver pool. Legacy single `approverUserId` rows are widened into
    // a one-element array when this prefill is built (see handleConfigure).
    steps: Array<{ stepOrder: string; approverRole: string; approverUserIds: string[] }>;
  };
  replaceIds?: string[];
}

interface WorkflowStep {
  stepOrder?: number | string;
  approverRole?: string; approverRoleId?: string;
  approverUserIds?: string[]; approverUserId?: string;
}
interface WorkflowRow {
  id: string; name?: string; isActive?: boolean;
  projectId?: string | null; entityType?: string;
  steps?: WorkflowStep[];
}
interface ProjectLite {
  id: string; code?: string; name?: string; siteName?: string;
}

export default function WorkflowsPage() {
  // Fetch every workflow in one shot — page is small enough that
  // client-side bucketing by scope is simpler than a query per tab and
  // we get instant tab-switch with no spinner.
  const { data: result, isLoading: workflowsLoading } = useWorkflows();
  const workflows = (result?.data ?? []) as unknown as WorkflowRow[];

  const { data: projectsResult, isLoading: projectsLoading } = useProjects({ status: "active" });
  const projects = (projectsResult?.data ?? []) as unknown as ProjectLite[];

  const isPageLoading = workflowsLoading || projectsLoading;

  // Default-load the first active project once projects arrive. Until
  // then `scope` stays null and the page falls through to the no-projects
  // empty state. `useEffect` only fires once because we only set it when
  // the current scope is null AND projects.length > 0.
  const [scope, setScope] = useState<Scope>(null);
  useEffect(() => {
    if (scope === null && projects.length > 0) {
      setScope(projects[0].id);
    }
  }, [scope, projects]);
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);

// Accordion state — `collapsedModules` holds the module keys (e.g.
  // "purchase", "projects", "store") that the admin has clicked shut.
  // Storing collapsed (rather than expanded) keys means new modules
  // are expanded by default when added to MODULE_GROUPS — no migration
  // needed. Persisted in localStorage so the admin's preferred view
  // sticks across refreshes.
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("workflows.collapsedModules");
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });
  const toggleModuleOpen = (key: string) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            "workflows.collapsedModules",
            JSON.stringify(Array.from(next)),
          );
        } catch {
          /* localStorage quota / privacy mode — ignore */
        }
      }
      return next;
    });
  };

  // Bucket workflows by (projectId, entityType) once. Tenant-wide rows
  // (projectId IS NULL) are now legacy data — ignored on the page since
  // the runtime resolver no longer falls back to them. Key shape:
  //   "<projectId>::<entityType>"
  const workflowByScopeAndEntity = useMemo(() => {
    const map = new Map<string, WorkflowRow>();
    for (const wf of workflows) {
      if (!wf.projectId) continue;
      map.set(`${wf.projectId}::${wf.entityType}`, wf);
    }
    return map;
  }, [workflows]);

  // Count of workflows configured per project — drives the small badge
  // next to each project entry in the scope picker.
  const overrideCountByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const wf of workflows) {
      if (!wf.projectId) continue;
      counts.set(wf.projectId, (counts.get(wf.projectId) ?? 0) + 1);
    }
    return counts;
  }, [workflows]);

  const activeProjectId = scope;
  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : null;
  const activeProjectLabel =
    activeProject?.siteName ?? activeProject?.name ?? activeProject?.code ?? "Project";

  // Which workflow row applies for (currentProject, entityType)? No
  // cascade — undefined when the project hasn't configured this page.
  const effectiveWorkflow = (entityType: string) => {
    if (!activeProjectId) return { workflow: undefined };
    const own = workflowByScopeAndEntity.get(`${activeProjectId}::${entityType}`);
    return { workflow: own };
  };

  // Summary counts for the banner — totals are scoped to what applies
  // at submit time. On the Default tab that's just Default rows; on a
  // Coverage counters — scoped to the currently-selected project.
  const totalEntities = MODULE_GROUPS.reduce((sum, m) => sum + m.entities.length, 0);
  const configuredEntities = MODULE_GROUPS.reduce((sum, m) => {
    return sum + m.entities.filter((e) => !!effectiveWorkflow(e.type).workflow).length;
  }, 0);

  // All workflow operations now target a single page (entity type)
  // rather than aggregating across a module. The parent `mod` is still
  // passed so the drawer banner can show the module breadcrumb — it
  // doesn't affect what's saved. We continue to reuse the drawer's
  // `moduleMode` shape, just with a single-element `entityTypes` array
  // so the "save = create one row per entity" loop still works without
  // a second mode.
  const handleConfigure = (entity: ModuleEntity, mod: ModuleGroup) => {
    if (!activeProjectId) return;
    setDrawerState({
      module: { ...mod, entities: [entity] },
      pageLabel: entity.label,
      moduleLabel: mod.label,
      scopeProjectId: activeProjectId,
      scopeLabel: activeProjectLabel,
    });
  };

  const handleEdit = (entity: ModuleEntity, mod: ModuleGroup) => {
    if (!activeProjectId) return;
    const existing = workflowByScopeAndEntity.get(`${activeProjectId}::${entity.type}`);
    setDrawerState({
      module: { ...mod, entities: [entity] },
      pageLabel: entity.label,
      moduleLabel: mod.label,
      scopeProjectId: activeProjectId,
      scopeLabel: activeProjectLabel,
      prefill: {
        name: existing?.name ?? "",
        isActive: existing?.isActive ?? true,
        // Hydrate the approver pool — prefer the new array column, fall
        // back to the legacy single id so workflows saved before the
        // multi-approver migration still round-trip into the drawer.
        steps: (existing?.steps ?? []).map((s) => {
          const ids: string[] = Array.isArray(s.approverUserIds) && s.approverUserIds.length
            ? s.approverUserIds
            : s.approverUserId
              ? [s.approverUserId]
              : [];
          return {
            stepOrder: String(s.stepOrder ?? 1),
            approverRole: s.approverRole ?? s.approverRoleId ?? "",
            approverUserIds: ids,
          };
        }),
      },
      replaceIds: existing ? [existing.id] : [],
    });
  };

  return (
    <>
      <PageHeader
        title="Approval Workflows"
        subtitle="Configure a workflow per project — set approval steps for each page that needs one"
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Workflows" }]}
      />

      <PageContainer>
        {isPageLoading ? (
          <WorkflowsPageSkeleton />
        ) : (
        <>
        {/* Scope + coverage as two separate cards in a row. The project
            picker carries its own card chrome (drop `bare`) so the two
            tiles read as distinct surfaces — picking a project on the
            left, seeing what's covered on the right. `flex-wrap` lets
            the row stack on narrow viewports so chips don't overflow. */}
        <div className="mb-3 flex flex-wrap gap-3 items-stretch">
          <div className="flex-1 min-w-[260px]">
            <ProjectScopeDropdown
              scope={scope}
              onChange={setScope}
              projects={projects}
              overrideCountByProject={overrideCountByProject}
            />
          </div>
          <div className="flex-1 min-w-[300px] bg-white rounded-xl border border-gray-200 flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Coverage
                </div>
                <div className="text-sm font-bold text-gray-900 truncate">
                  {configuredEntities} of {totalEntities} pages covered
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] shrink-0 flex-wrap justify-end">
              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                <CheckCircle2 className="w-3 h-3" /> {configuredEntities} Active
              </span>
              <span className="inline-flex items-center gap-1 text-gray-600 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full font-semibold">
                <CircleDashed className="w-3 h-3" />{" "}
                {totalEntities - configuredEntities} Pending
              </span>
            </div>
          </div>
        </div>

        {/* No-projects guard — without at least one active project the
            entire page is non-actionable (workflows now save strictly
            per project). Show a clear inline empty state with a direct
            path to the Projects master rather than letting the admin
            click disabled rows. */}
        {projects.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 flex flex-col items-center text-center">
            <div className="relative inline-flex items-center justify-center w-20 h-20 mb-4">
              <div className="absolute inset-0 rounded-full bg-accent-50 blur-xl opacity-70" />
              <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-accent-500 to-amber-500 text-white shadow-lg shadow-accent-200 ring-[6px] ring-accent-50">
                <Workflow className="w-9 h-9" strokeWidth={1.8} />
              </div>
            </div>
            <h3 className="text-base font-bold text-gray-900 tracking-tight">
              Add a project first
            </h3>
            <p className="text-xs text-gray-500 mt-1.5 max-w-md leading-relaxed">
              Approval workflows are scoped to a project, so you'll need at
              least one active project before you can configure routing for
              Purchase, Projects, Store, or Machinery & Equipment pages.
            </p>
            <Link
              href="/masters/projects"
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 px-4 py-2 text-sm font-semibold text-white shadow-brand active:translate-y-[1px] transition-all"
            >
              Go to Projects
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
        /* Module sections — the *grouping* stays module-based so the
            visual hierarchy (Purchase / Projects / Store) is preserved,
            but every workflow is configured per page. Configure / Edit /
            Reset live on the page card and only ever touch a single
            row. The module header is a pure visual divider with
            roll-up counts; no bulk actions. */
        <div className="space-y-3">
          {MODULE_GROUPS.map((mod) => {
            const Icon = mod.iconComponent;
            const entityRows = mod.entities.map((et) => ({
              entity: et,
              ...effectiveWorkflow(et.type),
            }));
            const moduleConfigured = entityRows.filter((r) => r.workflow).length;
            const moduleTotal = entityRows.length;

            const isCollapsed = collapsedModules.has(mod.key);

            return (
              <section
                key={mod.key}
                className="rounded-xl border border-gray-200 bg-white overflow-hidden"
              >
                {/* Module header — collapsible accordion trigger.
                    The whole row is a button so the click target is
                    forgiving (header text, icon, chevron, chips all
                    toggle). aria-expanded + aria-controls give the
                    list semantic meaning for screen readers. */}
                <button
                  type="button"
                  onClick={() => toggleModuleOpen(mod.key)}
                  aria-expanded={!isCollapsed}
                  aria-controls={`module-section-${mod.key}`}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${
                      isCollapsed ? "-rotate-90" : ""
                    }`}
                  />
                  <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-gray-900">
                        {mod.label}
                      </h3>
                      <span className="text-[11px] text-gray-500">{mod.description}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                        moduleConfigured === moduleTotal
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : moduleConfigured > 0
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-gray-50 text-gray-500 border-gray-200"
                      }`}
                    >
                      {moduleConfigured}/{moduleTotal} configured
                    </span>
                  </div>
                </button>

                {/* Collapsible body — animated open/close via the
                    grid-rows [0fr↔1fr] trick so the panel slides to its
                    natural height with no fixed max-height guesswork. The
                    inner wrapper keeps overflow-hidden so content clips
                    cleanly while the row track animates. */}
                <div
                  id={`module-section-${mod.key}`}
                  aria-hidden={isCollapsed}
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                {/* Pages list — one wide row per document type.
                    Designed for at-a-glance scanning:
                      ── Big colored status icon on the left answers
                         "done?" before the eye reaches the label.
                      ── Centre column carries the page name + a single
                         readable line summarising the workflow ("Pr-Flow
                         · 1 approval step") or the empty-state nudge
                         ("No workflow yet — set up approval steps").
                      ── Right column carries exactly one primary action
                         (configured rows offer Edit + Reset on project
                         tabs as a secondary). Replaces the previous
                         2-column card grid which made every row look
                         identical regardless of state. */}
                <div className="border-t border-gray-100 divide-y divide-gray-100">
                  {entityRows.map(({ entity, workflow }) => {
                    const isConfigured = !!workflow;
                    const stepCount = workflow?.steps?.length ?? 0;

                    // Two row states now — configured (faint green) or
                    // empty (plain white). No inherited / override
                    // variants since Default is gone.
                    const rowTint = isConfigured
                      ? "bg-emerald-50/30"
                      : "bg-white";

                    const summary: React.ReactNode = !isConfigured ? (
                      <span className="text-gray-500">
                        No workflow yet — set up approval steps for this page.
                      </span>
                    ) : (
                      <>
                        <span className="font-semibold text-gray-800">
                          {workflow?.name ?? "Untitled"}
                        </span>{" "}
                        <span className="text-gray-400">·</span>{" "}
                        <span className="tabular-nums">
                          {stepCount} approval {stepCount === 1 ? "step" : "steps"}
                        </span>
                      </>
                    );

                    return (
                      <div
                        key={entity.type}
                        className={`flex items-center gap-4 px-4 py-3 transition-colors ${rowTint}`}
                      >
                        <PageStatusIcon
                          state={isConfigured ? "active" : "empty"}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-gray-900 truncate">
                            {entity.label}
                          </div>
                          <div className="text-[12px] text-gray-600 truncate mt-0.5">
                            {summary}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isConfigured ? (
                            <button
                              type="button"
                              onClick={() => handleEdit(entity, mod)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-accent-700 bg-white hover:bg-accent-50 border border-accent-200 transition-colors"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleConfigure(entity, mod)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 transition-colors"
                            >
                              <Plus className="w-3 h-3" /> Configure
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
        )}
        </>
        )}
      </PageContainer>

      <NewWorkflowDrawer
        open={drawerState !== null}
        onClose={() => setDrawerState(null)}
        moduleMode={
          drawerState
            ? {
                // Drawer title reads "Configure <Module> → <Page> Workflow"
                // so the admin sees both the section and the specific page
                // being edited.
                moduleLabel: `${drawerState.moduleLabel} → ${drawerState.pageLabel}`,
                entityTypes: drawerState.module.entities,
                prefill: drawerState.prefill,
                replaceIds: drawerState.replaceIds,
                projectId: drawerState.scopeProjectId,
                projectLabel: drawerState.scopeLabel,
              }
            : undefined
        }
      />
    </>
  );
}

// ─── Local UI atoms ──────────────────────────────────────────────────

function WorkflowsPageSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-3 flex flex-wrap gap-3 items-stretch">
        <div className="flex-1 min-w-[260px] h-[72px] rounded-xl bg-gray-100" />
        <div className="flex-1 min-w-[300px] h-[72px] rounded-xl bg-gray-100" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((m) => (
          <section key={m}>
            <div className="flex items-center gap-3 mb-2 px-1 py-1">
              <div className="w-4 h-4 rounded bg-gray-200 shrink-0" />
              <div className="w-8 h-8 rounded-lg bg-gray-200 shrink-0" />
              <div className="h-4 w-40 rounded bg-gray-200" />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                    <div className="space-y-2">
                      <div className="h-3.5 w-36 rounded bg-gray-200" />
                      <div className="h-3 w-56 rounded bg-gray-100" />
                    </div>
                  </div>
                  <div className="h-8 w-24 rounded-md bg-gray-200" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ProjectScopeDropdown({
  scope,
  onChange,
  projects,
  overrideCountByProject,
  bare = false,
}: {
  scope: Scope;
  onChange: (next: Scope) => void;
  projects: ProjectLite[];
  overrideCountByProject: Map<string, number>;
  /**
   * When true, drops the trigger's own `bg-white rounded-xl border`
   * chrome. Used when the dropdown sits inside a parent card that
   * already provides the frame, so the trigger flows in rather than
   * forming a card-in-card. Open-state ring is preserved either way.
   */
  bare?: boolean;
}) {
  // Project picker — one row per active project. No tenant-wide
  // Default option: workflows are configured strictly per project.
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const enriched = useMemo(
    () =>
      projects.map((p) => ({
        id: p.id as string,
        label: (p.siteName ?? p.name ?? p.code ?? p.id) as string,
        code: (p.code ?? "") as string,
        overrides: overrideCountByProject.get(p.id) ?? 0,
      })),
    [projects, overrideCountByProject],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? enriched.filter(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q),
        )
      : enriched;
    return matched.sort((a, b) => {
      if (b.overrides !== a.overrides) return b.overrides - a.overrides;
      return a.label.localeCompare(b.label);
    });
  }, [enriched, query]);

  const active = scope ? enriched.find((p) => p.id === scope) ?? null : null;
  const triggerLabel = active?.label ?? "Select a project";
  const triggerSub = active
    ? active.overrides > 0
      ? `${active.overrides} workflow${active.overrides === 1 ? "" : "s"} configured`
      : "No workflows configured yet"
    : projects.length === 0
      ? "Add a project to configure workflows"
      : "Pick a project to configure its workflows";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          bare
            ? `w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors text-left ${
                open
                  ? "bg-accent-50 ring-1 ring-inset ring-accent-200"
                  : "hover:bg-gray-50/60"
              } disabled:opacity-60 disabled:cursor-not-allowed`
            : `w-full flex items-center justify-between gap-3 bg-white rounded-xl border px-4 py-3 transition-colors ${
                open
                  ? "border-accent-300 ring-2 ring-accent-100"
                  : "border-gray-200 hover:border-gray-300"
              } disabled:opacity-60 disabled:cursor-not-allowed`
        }
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-accent-50 text-accent-600">
            <FolderKanban className="w-4 h-4" />
          </div>
          <div className="min-w-0 text-left">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Project
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900 truncate">
                {triggerLabel}
              </span>
              {active && active.overrides > 0 && (
                <span className="inline-flex items-center justify-center text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full bg-accent-100 text-accent-700">
                  {active.overrides}
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-500 truncate">
              {triggerSub}
            </div>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects by name or code…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="p-1 text-gray-400 hover:text-gray-600 shrink-0"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400 italic">
                {projects.length === 0
                  ? "No active projects yet."
                  : `No projects match “${query}”.`}
              </div>
            ) : (
              filtered.map((p) => {
                const isActive = scope === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onChange(p.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      isActive ? "bg-accent-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                        isActive
                          ? "bg-accent-100 text-accent-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <FolderKanban className="w-3.5 h-3.5" />
                    </span>
                    <span className="flex flex-col leading-tight min-w-0 flex-1">
                      <span
                        className={`text-sm font-semibold truncate ${
                          isActive ? "text-accent-700" : "text-gray-900"
                        }`}
                      >
                        {p.label}
                      </span>
                      <span className="text-[11px] text-gray-500 truncate">
                        {p.overrides > 0
                          ? `${p.overrides} workflow${p.overrides === 1 ? "" : "s"} configured`
                          : "No workflows configured"}
                      </span>
                    </span>
                    {p.overrides > 0 && (
                      <span className="inline-flex items-center justify-center text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full bg-accent-100 text-accent-700 shrink-0">
                        {p.overrides}
                      </span>
                    )}
                    {isActive && (
                      <CheckCircle2 className="w-4 h-4 text-accent-600 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PageStatusIcon({
  state,
}: {
  state: "empty" | "active" | "custom" | "inherited";
}) {
  // The single most important affordance on each page row — answers
  // "is this done?" before the eye reaches the label. Replaces the
  // previous combo of two small pills with one 28px coloured disc:
  //   empty     → grey dashed ring (needs setup)
  //   active    → green check (Default rule live)
  //   custom    → blue check (project's own rule)
  //   inherited → faint grey check (uses Default — fine but secondary)
  const cfg = {
    empty: {
      bg: "bg-white border-2 border-dashed border-gray-300",
      icon: <CircleDashed className="w-4 h-4 text-gray-400" />,
      title: "No workflow configured",
    },
    active: {
      bg: "bg-emerald-100 border border-emerald-200",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
      title: "Workflow active",
    },
    custom: {
      bg: "bg-orange-100 border border-orange-200",
      icon: <CheckCircle2 className="w-4 h-4 text-orange-600" />,
      title: "Custom rule for this project",
    },
    inherited: {
      bg: "bg-gray-100 border border-gray-200",
      icon: <CheckCircle2 className="w-4 h-4 text-gray-400" />,
      title: "Uses the Default rule",
    },
  }[state];
  return (
    <span
      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${cfg.bg}`}
      title={cfg.title}
      aria-label={cfg.title}
    >
      {cfg.icon}
    </span>
  );
}
