"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart, Warehouse, FolderKanban, CheckCircle2,
  AlertTriangle, Package, FileText, ClipboardList,
  ArrowRight, HardHat, Truck,
} from "lucide-react";
import {
  PageContainer, PageHeader, KPICard, StatusChip,
  EmptyState, PageSkeleton,
} from "@/components/PageShell";
import { usePermissions } from "@/hooks/use-permissions";

export default function DashboardPage() {
  const router = useRouter();
  const { hasModule, canMenuAction, isLoading: permsLoading } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
  });

  const kpis = data?.kpis ?? {};
  const recent = data?.recentActivity ?? { prs: [], pos: [] };

  if (isLoading || permsLoading) return <PageSkeleton />;

  // Module gates — super admins / users with no module restriction get
  // everything (hasModule returns true). Restricted users only see tiles,
  // recent lists, and quick actions whose owning module is in their
  // modulesAssigned list. The data itself is already project-scoped server-
  // side in /api/dashboard so there's nothing to leak via the client.
  const showProjects = hasModule("project_mgmt");
  const showPurchase = hasModule("purchase");
  const showStore = hasModule("store");
  const showMasters = hasModule("masters");
  // Pending Approvals is cross-module — show it whenever the user has any
  // module that produces approvals (PRs, POs, DPRs, WOs, GRNs).
  const showApprovals = showPurchase || showStore || showProjects;

  type Tile = { node: ReactNode; show: boolean };

  const row1: Tile[] = [
    {
      show: showProjects,
      node: (
        <KPICard key="projects" title="Active Projects" value={kpis.activeProjects ?? 0} subtitle="Across your sites"
          icon={<FolderKanban className="w-5 h-5" />} color="blue" onClick={() => router.push("/masters/projects")} />
      ),
    },
    {
      show: showApprovals,
      node: (
        <KPICard key="approvals" title="Pending Approvals" value={kpis.pendingApprovals ?? 0} subtitle="PRs, POs, DPRs, WOs"
          icon={<CheckCircle2 className="w-5 h-5" />} color="amber" onClick={() => router.push("/approvals")} />
      ),
    },
    {
      show: showPurchase,
      node: (
        <KPICard key="pos" title="Open Purchase Orders" value={kpis.openPOs ?? 0} subtitle="Awaiting delivery"
          icon={<ShoppingCart className="w-5 h-5" />} color="purple" onClick={() => router.push("/purchase/orders")} />
      ),
    },
    {
      show: showStore,
      node: (
        <KPICard key="lowstock" title="Low Stock Items" value={kpis.lowStockItems ?? 0} subtitle="Below minimum level"
          icon={<AlertTriangle className="w-5 h-5" />} color="red" onClick={() => router.push("/store/stock-register")} />
      ),
    },
  ];

  const row2: Tile[] = [
    {
      show: showStore,
      node: (
        <KPICard key="grn" title="GRNs This Month" value={kpis.grnThisMonth ?? 0} icon={<Package className="w-5 h-5" />} color="green" />
      ),
    },
    {
      show: showStore,
      node: (
        <KPICard key="issues" title="Material Issues" value={kpis.issuesThisMonth ?? 0} subtitle="This month" icon={<Warehouse className="w-5 h-5" />} color="sky" />
      ),
    },
    {
      show: showProjects,
      node: (
        <KPICard key="wos" title="Active Work Orders" value={kpis.activeWOs ?? 0} icon={<HardHat className="w-5 h-5" />} color="orange" />
      ),
    },
    {
      show: showProjects,
      node: (
        <KPICard key="dprs" title="DPRs Pending" value={kpis.pendingDPRApproval ?? 0} icon={<FileText className="w-5 h-5" />} color="indigo" />
      ),
    },
  ];

  // Flatten the two row definitions into a single visible-tile list. The
  // old 2-row layout left half-empty rows for users with only one module
  // assigned (e.g. project_mgmt → 4 tiles in a 4-col grid felt sparse).
  // A single grid lets the column count adapt to whatever is visible.
  const visibleTiles = [...row1, ...row2].filter((t) => t.show);
  const tileGridCols =
    visibleTiles.length <= 2
      ? "grid-cols-1 sm:grid-cols-2"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  // Quick Actions are "Create X" shortcuts. Two-stage gate so the
  // shortcut hides whenever the user can't actually use it:
  //   1. Module gate — `hasModule` keeps the whole module out of view
  //      for users who weren't assigned it (e.g. a Site Engineer with
  //      only `store` won't see purchase shortcuts).
  //   2. Action gate — `canMenuAction(href, "add")` consults the
  //      per-menu Add/Edit/Delete/View matrix saved on the user. So a
  //      user with `purchase` module access but `add: false` on
  //      Purchase Requisitions still won't see "Create PR" — only the
  //      shortcuts they can actually act on appear here.
  const quickActions = [
    { label: "Create Purchase Requisition", href: "/purchase/requisitions", icon: ClipboardList, color: "text-blue-600 bg-blue-50",  module: "purchase" },
    { label: "Record GRN",                  href: "/store/grn",              icon: Package,        color: "text-green-600 bg-green-50", module: "store" },
    { label: "Issue Material",              href: "/store/issue",            icon: Warehouse,      color: "text-purple-600 bg-purple-50", module: "store" },
    { label: "Submit DPR",                  href: "/projects/dpr",           icon: FileText,       color: "text-orange-600 bg-orange-50", module: "project_mgmt" },
    { label: "Add Vendor",                  href: "/masters/vendors",        icon: Truck,          color: "text-sky-600 bg-sky-50",   module: "masters" },
    { label: "Create Work Order",           href: "/projects/work-orders",   icon: HardHat,        color: "text-amber-600 bg-amber-50", module: "project_mgmt" },
  ].filter((a) => hasModule(a.module) && canMenuAction(a.href, "add"));

  // If a non-admin user has no assigned modules at all, the dashboard is
  // effectively empty. Show a friendly message instead of a blank page so
  // they know to ask their admin for access rather than thinking the app
  // is broken.
  const nothingVisible = visibleTiles.length === 0 && quickActions.length === 0;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Construction operations overview" />

      <PageContainer>
        {nothingVisible ? (
          <EmptyState
            title="No modules assigned yet"
            description="Your account doesn't have any modules enabled. Please contact your administrator to grant access."
            icon={<ClipboardList className="w-8 h-8" />}
          />
        ) : (
          <>
            {/* KPI tiles — single flat grid so a small visible-tile count
                doesn't leave awkward empty columns. */}
            {visibleTiles.length > 0 && (
              <div className={`grid ${tileGridCols} gap-4`}>
                {visibleTiles.map((t) => t.node)}
              </div>
            )}

            {/* Main Grid — only render the 2:1 split when Recent Activity
                actually has content to put in the wide column. Otherwise
                Quick Actions renders as a constrained card on its own. */}
            {showPurchase ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* Recent PRs */}
                    <ActivityCard
                      title="Recent Purchase Requisitions"
                      onViewAll={() => router.push("/purchase/requisitions")}
                      empty={recent.prs.length === 0 ? <EmptyState title="No recent PRs" description="Purchase requisitions will appear here." icon={<ClipboardList className="w-8 h-8" />} /> : null}
                    >
                      {recent.prs.map((pr: any) => (
                        <button
                          type="button"
                          key={pr.id}
                          onClick={() => router.push(`/purchase/requisitions/${pr.id}`)}
                          className="group w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-orange-50/50 transition-colors text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 group-hover:text-orange-700 transition-colors truncate">{pr.number}</p>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{pr.project} &middot; {new Date(pr.date).toLocaleDateString()}</p>
                          </div>
                          <StatusChip status={pr.status} />
                        </button>
                      ))}
                    </ActivityCard>

                    {/* Recent POs */}
                    <ActivityCard
                      title="Recent Purchase Orders"
                      onViewAll={() => router.push("/purchase/orders")}
                      empty={recent.pos.length === 0 ? <EmptyState title="No recent POs" description="Purchase orders will appear here." icon={<ShoppingCart className="w-8 h-8" />} /> : null}
                    >
                      {recent.pos.map((po: any) => (
                        <button
                          type="button"
                          key={po.id}
                          onClick={() => router.push(`/purchase/orders/${po.id}`)}
                          className="group w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-orange-50/50 transition-colors text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 group-hover:text-orange-700 transition-colors truncate">{po.number}</p>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{po.vendor} &middot; {po.project}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-sm font-semibold text-slate-900 tabular-nums">₹ {Number(po.amount).toLocaleString("en-IN")}</span>
                            <StatusChip status={po.status} />
                          </div>
                        </button>
                      ))}
                    </ActivityCard>
                </div>

                {/* Quick Actions — right column when Recent Activity present */}
                {quickActions.length > 0 && <QuickActionsCard actions={quickActions} onPick={(href) => router.push(href)} />}
              </div>
            ) : (
              quickActions.length > 0 && (
                /* No Recent Activity — render Quick Actions as a standalone
                   constrained card so it doesn't float in a half-empty grid. */
                <div className="mt-6 max-w-md">
                  <QuickActionsCard actions={quickActions} onPick={(href) => router.push(href)} />
                </div>
              )
            )}
          </>
        )}
      </PageContainer>
    </>
  );
}

// ─── Dashboard-only sub-components ──────────────────────────────────

function ActivityCard({
  title,
  onViewAll,
  empty,
  children,
}: {
  title: string;
  onViewAll: () => void;
  empty: ReactNode | null;
  children: ReactNode;
}) {
  return (
    <div className="relative bg-white rounded-xl border border-slate-200 shadow-soft overflow-hidden">
      <span aria-hidden className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 opacity-70" />
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <span aria-hidden className="w-1 h-4 rounded-full bg-gradient-to-b from-orange-500 to-orange-600" />
          {title}
        </h3>
        <button
          onClick={onViewAll}
          className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 px-2 py-1 rounded-md hover:bg-orange-50 transition-colors"
        >
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      {empty ? <div className="p-5">{empty}</div> : <div className="divide-y divide-slate-100">{children}</div>}
    </div>
  );
}

function QuickActionsCard({
  actions,
  onPick,
}: {
  actions: Array<{ label: string; href: string; icon: any; color: string }>;
  onPick: (href: string) => void;
}) {
  return (
    <div className="relative bg-white rounded-xl border border-slate-200 shadow-soft h-fit overflow-hidden">
      <span aria-hidden className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 via-orange-400 to-orange-600 opacity-70" />
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <span aria-hidden className="w-1 h-4 rounded-full bg-gradient-to-b from-orange-500 to-orange-600" />
          Quick Actions
        </h3>
      </div>
      <div className="p-2.5 space-y-0.5">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => onPick(action.href)}
            className="group w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-orange-50/60 transition-colors text-left"
          >
            <div className={`w-8 h-8 rounded-lg ${action.color} flex items-center justify-center transition-transform group-hover:scale-105`}>
              <action.icon className="w-4 h-4" />
            </div>
            <span className="text-sm text-slate-700 font-medium group-hover:text-orange-800 transition-colors">{action.label}</span>
            <ArrowRight className="w-3.5 h-3.5 ml-auto text-slate-300 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all" />
          </button>
        ))}
      </div>
    </div>
  );
}
