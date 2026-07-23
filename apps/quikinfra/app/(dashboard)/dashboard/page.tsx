"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart, Warehouse, FolderKanban, CheckCircle2,
  AlertTriangle, Package, FileText, ClipboardList,
  ArrowRight, HardHat, Truck,
} from "lucide-react";
import {
  KPICard, StatusChip,
  EmptyState, PageSkeleton,
  UserAvatar,
} from "@/components/PageShell";
import { usePermissions } from "@/hooks/use-permissions";

type ProjectProgressRow = {
  id: string;
  name: string;
  physicalPct: number;
  budgetPct: number;
  band: "on_track" | "in_progress" | "early_stage";
};

function AccentTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
      <span
        aria-hidden
        className="inline-block w-1 h-5 rounded-full bg-gradient-to-b from-accent-300 to-accent-600 shrink-0"
      />
      {children}
    </h2>
  );
}

function ProjectBandPill({ band }: { band: ProjectProgressRow["band"] }) {
  const styles = {
    on_track: "bg-orange-50 text-orange-600 border-orange-100",
    in_progress: "bg-blue-50 text-blue-600 border-blue-100",
    early_stage: "bg-green-50 text-green-600 border-green-100",
  } as const;
  const labels = {
    on_track: "On Track",
    in_progress: "In Progress",
    early_stage: "Early Stage",
  } as const;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[band]}`}>
      {labels[band]}
    </span>
  );
}

function ProgressBarRow({
  label,
  pct,
  barClass,
}: {
  label: string;
  pct: number;
  barClass: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500 font-medium">{label}</span>
        <span className="text-slate-700 font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-200/90 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClass}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

function physicalBarClass(band: ProjectProgressRow["band"]) {
  if (band === "on_track") return "bg-gradient-to-r from-[#FFAF55] to-[#ea580c]";
  if (band === "in_progress") return "bg-blue-500";
  return "bg-emerald-500";
}

// 20s hard cap on the dashboard fetch. On UAT the API can be slow (cold
// DB pool, 14 parallel queries) — without a cap the user is stuck on a
// blank loader.
const DASHBOARD_FETCH_TIMEOUT_MS = 20_000;

async function fetchDashboard() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DASHBOARD_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("/api/dashboard", {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Dashboard request failed (${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { hasModule, canMenuAction, can, isLoading: permsLoading } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  });

  const kpis = data?.kpis ?? {};
  const recent = data?.recentActivity ?? { prs: [], pos: [] };
  const projectProgress: ProjectProgressRow[] = data?.projectProgress ?? [];

  if (isLoading || permsLoading) {
    return (
      <div className="mx-auto min-h-full max-w-[1600px] px-4 py-6 md:px-6">
        <PageSkeleton />
      </div>
    );
  }

  const showProjects = hasModule("project_mgmt");
  const showPurchase = hasModule("purchase");
  const showStore = hasModule("store");
  const showMasters = hasModule("masters");
  const showApprovals = showPurchase || showStore || showProjects;

  // Approvals click-gate — the count is informational and we keep the
  // tile visible whenever any module is on, but the navigation only
  // fires when the user actually holds at least one `*.approve` permission.
  // Otherwise the user lands on /approvals and sees "All caught up" with
  // no actionable rows — clicking is a dead-end. Mirrors the exact set the
  // server-side inbox handler gates each block on.
  const canAnyApprove = can([
    "purchase.mr.approve",
    "purchase.indent.approve_l1",
    "purchase.indent.approve_l2",
    "purchase.indent.approve_l3",
    "purchase.po.approve_l1",
    "purchase.po.approve_l2",
    "purchase.grn.approve",
    "store.issue.approve",
    "store.gatepass.approve",
    "store.transfer.approve",
    "store.return.approve",
    "project.estimation.approve",
    "project.dpr.approve",
    "project.rab.approve",
    "project.wo.approve",
  ]);

  type Tile = { id: string; node: ReactNode; show: boolean };

  /** Six summary tiles — matches ops overview layout (no Material Issues / DPRs row). */
  const kpiTiles: Tile[] = [
    {
      id: "projects",
      show: true,
      node: (
        <KPICard
          variant="glass"
          key="projects"
          title="Active Projects"
          value={kpis.activeProjects ?? 0}
          subtitle="Across your sites"
          icon={<FolderKanban className="w-5 h-5" />}
          color="blue"
          onClick={
            // /masters/projects lives under the Masters module, so we
            // only enable navigation when the user actually holds that
            // permission. project_mgmt alone is not enough — those
            // users get a non-clickable view-only tile (handled by
            // KPICard when onClick is undefined).
            showMasters
              ? () => router.push("/masters/projects")
              : undefined
          }
        />
      ),
    },
    {
      id: "approvals",
      show: showApprovals,
      node: (
        <KPICard
          variant="glass"
          key="approvals"
          title="Pending Approvals"
          value={kpis.pendingApprovals ?? 0}
          subtitle="PRs, POs, DPRs, WOs"
          icon={<CheckCircle2 className="w-5 h-5" />}
          color="amber"
          // Tile stays visible (the count is useful peripheral info) but
          // clicking only navigates to /approvals when the user actually
          // holds at least one *.approve permission. Without any approve
          // grant the inbox would just show "All caught up" — a dead-end
          // click. KPICard renders as a non-interactive div when onClick
          // is undefined (no hover/cursor change).
          onClick={
            canAnyApprove ? () => router.push("/approvals") : undefined
          }
        />
      ),
    },
    {
      id: "pos",
      show: showPurchase,
      node: (
        <KPICard
          variant="glass"
          key="pos"
          title="Open Purchase Orders"
          value={kpis.openPOs ?? 0}
          subtitle="Awaiting delivery"
          icon={<ShoppingCart className="w-5 h-5" />}
          color="purple"
          onClick={() => router.push("/purchase/orders")}
        />
      ),
    },
    {
      id: "lowstock",
      show: showStore,
      node: (
        <KPICard
          variant="glass"
          key="lowstock"
          title="Low Stock Items"
          value={kpis.lowStockItems ?? 0}
          subtitle="Below minimum level"
          icon={<AlertTriangle className="w-5 h-5" />}
          color="red"
          onClick={() => router.push("/store/stock-register")}
        />
      ),
    },
    {
      id: "grn",
      show: showStore,
      node: (
        <KPICard
          variant="glass"
          key="grn"
          title="GRNs This Month"
          value={kpis.grnThisMonth ?? 0}
          subtitle="Received"
          icon={<Package className="w-5 h-5" />}
          color="green"
          onClick={() => router.push("/store/grn")}
        />
      ),
    },
    {
      id: "wos",
      show: showProjects,
      node: (
        <KPICard
          variant="glass"
          key="wos"
          title="Active Work Orders"
          value={kpis.activeWOs ?? 0}
          subtitle="In progress"
          icon={<HardHat className="w-5 h-5" />}
          color="orange"
          onClick={() => router.push("/projects/work-orders")}
        />
      ),
    },
  ];

  const visibleTiles = kpiTiles.filter((t) => t.show);
  const tileGridCols =
    visibleTiles.length <= 2
      ? "grid-cols-1 sm:grid-cols-2"
      : visibleTiles.length <= 4
        ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4"
        : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6";

  const quickActions = [
    { label: "Create Purchase Requisition", sub: "Tap to get started", action: "Create", href: "/purchase/requisitions", icon: ClipboardList, iconBg: "bg-orange-500", linkClass: "text-orange-600 hover:text-orange-700", module: "purchase" },
    { label: "Record GRN", sub: "Tap to get started", action: "Record", href: "/store/grn", icon: Package, iconBg: "bg-emerald-500", linkClass: "text-emerald-600 hover:text-emerald-700", module: "store" },
    { label: "Issue Material", sub: "Tap to get started", action: "Issue", href: "/store/issue", icon: Warehouse, iconBg: "bg-violet-500", linkClass: "text-violet-600 hover:text-violet-700", module: "store" },
    { label: "Submit DPR", sub: "Tap to get started", action: "Submit", href: "/projects/dpr", icon: FileText, iconBg: "bg-orange-500", linkClass: "text-orange-600 hover:text-orange-700", module: "project_mgmt" },
    { label: "Add Vendor", sub: "Tap to get started", action: "Add", href: "/masters/vendors", icon: Truck, iconBg: "bg-sky-500", linkClass: "text-sky-600 hover:text-sky-700", module: "masters" },
    { label: "Create Work Order", sub: "Tap to get started", action: "Create", href: "/projects/work-orders", icon: HardHat, iconBg: "bg-amber-500", linkClass: "text-amber-600 hover:text-amber-700", module: "project_mgmt" },
  ].filter((a) => hasModule(a.module) && canMenuAction(a.href, "add"));

  const nothingVisible = visibleTiles.length === 0 && quickActions.length === 0 && !showProjects;

  const recentBlock = showPurchase ? (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <AccentTitle>Recent Purchase Requisitions</AccentTitle>
          <button
            type="button"
            onClick={() => router.push("/purchase/requisitions")}
            className="group text-sm font-semibold text-accent-600 hover:text-accent-700 flex items-center gap-1"
          >
            View all <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
        {recent.prs.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No recent PRs" description="Purchase requisitions will appear here." icon={<ClipboardList className="w-8 h-8" />} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[28px_190px_minmax(0,1fr)_110px_120px] gap-2 px-5 py-2.5 bg-slate-50 text-[11px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                <span aria-hidden />
                <span>PR Number</span>
                <span>Project</span>
                <span>Date</span>
                <span className="text-right">Status</span>
              </div>
              <div className="divide-y divide-slate-100">
                {recent.prs.map((pr: { id: string; number: string; project: string; date: string; status: string }) => (
                  <button
                    type="button"
                    key={pr.id}
                    onClick={() => router.push(`/purchase/requisitions/${pr.id}`)}
                    className="w-full grid grid-cols-[28px_190px_minmax(0,1fr)_110px_120px] gap-2 px-5 py-3 text-left items-center hover:bg-slate-50 transition-colors"
                  >
                    <span aria-hidden className="w-4 h-4 rounded border border-slate-200 bg-white shrink-0 mx-auto" />
                    <span className="text-sm font-semibold text-blue-600 truncate">{pr.number}</span>
                    <span className="text-sm text-slate-600 truncate">{pr.project}</span>
                    <span className="text-sm text-slate-500 tabular-nums">{pr.date ? new Date(pr.date).toLocaleDateString() : "—"}</span>
                    <span className="flex justify-end">
                      <StatusChip status={pr.status} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <AccentTitle>Recent Purchase Orders</AccentTitle>
          <button
            type="button"
            onClick={() => router.push("/purchase/orders")}
            className="group text-sm font-semibold text-accent-600 hover:text-accent-700 flex items-center gap-1"
          >
            View all <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
        {recent.pos.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No recent POs" description="Purchase orders will appear here." icon={<ShoppingCart className="w-8 h-8" />} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[28px_190px_minmax(0,1fr)_110px_120px] gap-2 px-5 py-2.5 bg-slate-50 text-[11px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                <span aria-hidden />
                <span>PO Number</span>
                <span>Vendor / Project</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Status</span>
              </div>
              <div className="divide-y divide-slate-100">
                {recent.pos.map((po: { id: string; number: string; vendor: string; project: string; amount: number; status: string }) => (
                  <button
                    type="button"
                    key={po.id}
                    onClick={() => router.push(`/purchase/orders/${po.id}`)}
                    className="w-full grid grid-cols-[28px_190px_minmax(0,1fr)_110px_120px] gap-2 px-5 py-3 text-left items-center hover:bg-slate-50 transition-colors"
                  >
                    <span aria-hidden className="w-4 h-4 rounded border border-slate-200 bg-white shrink-0 mx-auto" />
                    <span className="text-sm font-semibold text-blue-600 truncate">{po.number}</span>
                    <span className="text-sm text-slate-600 truncate">{po.vendor}{po.vendor && po.project ? " · " : ""}{po.project}</span>
                    <span className="text-sm font-bold text-slate-900 tabular-nums text-right">₹ {Number(po.amount).toLocaleString("en-IN")}</span>
                    <span className="flex justify-end">
                      <StatusChip status={po.status} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  const projectSection =
    showProjects && projectProgress.length > 0 ? (
      <div>
        <div className="mb-4">
          <AccentTitle>Project Progress</AccentTitle>
          <p className="mt-2 text-sm text-slate-500">Physical completion vs budget utilisation</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {projectProgress.map((proj) => {
            // Only route to /masters/projects when the user actually has
            // the Masters module — that's where the page lives. Users
            // who can see the dashboard tile via project_mgmt but lack
            // Masters get a view-only card (no click, no hover affordance,
            // default cursor) so they don't bounce off a permission gate.
            const canOpen = showMasters;
            const baseClass =
              "rounded-2xl border border-[#ede8e3] bg-[#f9f8f7] p-5 text-left shadow-sm transition-all";
            if (canOpen) {
              return (
                <button
                  type="button"
                  key={proj.id}
                  onClick={() => router.push("/masters/projects")}
                  className={`${baseClass} hover:border-slate-300/80 hover:shadow-md`}
                >
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">{proj.name}</p>
                    <ProjectBandPill band={proj.band} />
                  </div>
                  <div className="space-y-4">
                    <ProgressBarRow label="Physical" pct={proj.physicalPct} barClass={physicalBarClass(proj.band)} />
                    <ProgressBarRow label="Budget Used" pct={proj.budgetPct} barClass="bg-slate-500" />
                  </div>
                </button>
              );
            }
            return (
              <div
                key={proj.id}
                className={`${baseClass} cursor-default select-text`}
                title="View-only — ask an admin for Masters access to open this project"
              >
                <div className="flex items-start justify-between gap-2 mb-4">
                  <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">{proj.name}</p>
                  <ProjectBandPill band={proj.band} />
                </div>
                <div className="space-y-4">
                  <ProgressBarRow label="Physical" pct={proj.physicalPct} barClass={physicalBarClass(proj.band)} />
                  <ProgressBarRow label="Budget Used" pct={proj.budgetPct} barClass="bg-slate-500" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ) : showProjects && projectProgress.length === 0 ? (
      <div>
        <div className="mb-4">
          <AccentTitle>Project Progress</AccentTitle>
          <p className="mt-2 text-sm text-slate-500">Physical completion vs budget utilisation</p>
        </div>
        <div className="rounded-2xl border border-[#ede8e3] bg-[#f9f8f7] p-8 shadow-sm">
          <EmptyState title="No active projects" description="Projects will appear here when available." icon={<FolderKanban className="w-8 h-8" />} />
        </div>
      </div>
    ) : null;

  const quickActionsCard = quickActions.length > 0 && (
    <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden h-fit">
      <div className="px-5 py-4 border-b border-slate-100 bg-white">
        <AccentTitle>Quick Actions</AccentTitle>
      </div>
      <div className="space-y-1 bg-white p-3">
        {quickActions.map((a) => (
          <button
            type="button"
            key={a.label}
            onClick={() => router.push(a.href)}
            className="w-full flex items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50 group"
          >
            <div className={`w-11 h-11 rounded-xl ${a.iconBg} text-white flex items-center justify-center shrink-0 shadow-sm`}>
              <a.icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 leading-tight">{a.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{a.sub}</p>
            </div>
            <span className={`text-sm font-semibold shrink-0 ${a.linkClass}`}>{a.action}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mx-auto min-h-full max-w-[1600px] px-4 py-4 md:px-6 md:py-6">
      {nothingVisible ? (
        <EmptyState
          title="No modules assigned yet"
          description="Your account doesn't have any modules enabled. Please contact your administrator to grant access."
          icon={<ClipboardList className="w-8 h-8" />}
        />
      ) : (
        <div className="space-y-8">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_12px_40px_-12px_rgba(15,23,42,0.08)]">
            <div className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage: "url(/assets/constructionimg.png)",
                  backgroundPosition: "center 48%",
                }}
              />

              <div className="relative z-10 px-5 pb-6 pt-6 sm:px-7 sm:pb-7 sm:pt-7 md:px-8 md:pb-7">
                <h1 className="sr-only">Dashboard</h1>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 h-10 w-1 shrink-0 rounded-full bg-gradient-to-b from-accent-300 to-accent-600 shadow-md"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Dashboard</p>
                      <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900 sm:text-[1.125rem]">
                        Project Operations
                      </h2>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
                        Live summary across all your construction sites
                      </p>
                    </div>
                  </div>
                </div>

                {visibleTiles.length > 0 && (
                  <div className={`mt-5 grid ${tileGridCols} gap-3 sm:mt-6 sm:gap-3.5`}>
                    {visibleTiles.map((t) => (
                      <div key={t.id}>{t.node}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {projectSection}

          {(recentBlock || quickActionsCard) && (
            <div
              className={`grid gap-6 lg:gap-8 ${recentBlock && quickActionsCard ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1"
                }`}
            >
              {recentBlock ? <div className="min-w-0 space-y-6 lg:col-span-2">{recentBlock}</div> : null}
              {quickActionsCard ? (
                <div className={`min-w-0 ${recentBlock ? "" : "max-w-xl"}`}>{quickActionsCard}</div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
