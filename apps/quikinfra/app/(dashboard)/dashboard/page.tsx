"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart, Warehouse, FolderKanban, CheckCircle2,
  AlertTriangle, Package, FileText, ClipboardList,
  ArrowRight, HardHat, Truck,
  MapPin, CalendarDays, ChevronLeft, ChevronRight,
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
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
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

const BAND_THEME = {
  on_track: {
    pill: "bg-orange-50 text-orange-600 border-orange-100",
    wash: "from-orange-50/80",
    blob: "bg-orange-300/40",
    dot: "bg-orange-500",
    arrow: "text-orange-500",
    label: "On Track",
  },
  in_progress: {
    pill: "bg-blue-50 text-blue-600 border-blue-100",
    wash: "from-blue-50/80",
    blob: "bg-blue-300/40",
    dot: "bg-blue-500",
    arrow: "text-blue-500",
    label: "In Progress",
  },
  early_stage: {
    pill: "bg-slate-100 text-slate-600 border-slate-200",
    wash: "from-slate-100/80",
    blob: "bg-slate-300/40",
    dot: "bg-slate-500",
    arrow: "text-slate-500",
    label: "Early Stage",
  },
} as const;

function ProjectBandPill({ band }: { band: ProjectProgressRow["band"] }) {
  const theme = BAND_THEME[band];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${theme.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
      {theme.label}
    </span>
  );
}

function fmtMonthYear(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function projectTimeline(proj: ProjectProgressRow): string {
  const start = fmtMonthYear(proj.startDate);
  const end = fmtMonthYear(proj.endDate);
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Due ${end}`;
  return "Timeline not set";
}

function ProjectRowContent({ proj, canOpen }: { proj: ProjectProgressRow; canOpen: boolean }) {
  const theme = BAND_THEME[proj.band];
  return (
    <div className="relative flex flex-col">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-sm font-bold uppercase text-white shadow-md shadow-accent-500/30 ring-1 ring-white/40"
        >
          {proj.name?.trim().charAt(0) || "P"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{proj.name}</p>
          <div className="mt-1">
            <ProjectBandPill band={proj.band} />
          </div>
        </div>
        {canOpen && (
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200/70 transition-all group-hover:translate-x-0.5 group-hover:ring-accent-300 ${theme.arrow}`}>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <p className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{proj.location || "No location set"}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {projectTimeline(proj)}
        </p>
      </div>
    </div>
  );
}

function ProjectCard({ proj, canOpen, onOpen }: { proj: ProjectProgressRow; canOpen: boolean; onOpen: () => void }) {
  const cardClass =
    "group relative w-full rounded-2xl border border-slate-200/70 bg-white p-4 text-left shadow-sm transition-all";
  if (canOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`${cardClass} hover:-translate-y-0.5 hover:border-accent-300/70 hover:shadow-md`}
      >
        <ProjectRowContent proj={proj} canOpen />
      </button>
    );
  }
  return (
    <div
      className={`${cardClass} cursor-default`}
      title="View-only — ask an admin for Masters access to open this project"
    >
      <ProjectRowContent proj={proj} canOpen={false} />
    </div>
  );
}

const PROJECTS_PER_PAGE = 3;

function ProjectCarousel({
  projects,
  canOpen,
  onOpen,
}: {
  projects: ProjectProgressRow[];
  canOpen: boolean;
  onOpen: () => void;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(projects.length / PROJECTS_PER_PAGE));
  const current = Math.min(page, pageCount - 1);
  const pages = Array.from({ length: pageCount }, (_, i) =>
    projects.slice(i * PROJECTS_PER_PAGE, i * PROJECTS_PER_PAGE + PROJECTS_PER_PAGE),
  );
  const showControls = pageCount > 1;

  return (
    <div>
      <div className="flex items-center gap-2 sm:gap-3">
        {showControls && (
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={current === 0}
            aria-label="Previous projects"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-accent-300 hover:text-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${current * 100}%)` }}
          >
            {pages.map((group, gi) => (
              <div
                key={gi}
                className="grid w-full shrink-0 grid-cols-1 gap-4 px-0.5 py-1 sm:grid-cols-2 lg:grid-cols-3"
              >
                {group.map((proj) => (
                  <ProjectCard key={proj.id} proj={proj} canOpen={canOpen} onOpen={onOpen} />
                ))}
              </div>
            ))}
          </div>
        </div>
        {showControls && (
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={current === pageCount - 1}
            aria-label="Next projects"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-accent-300 hover:text-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {showControls && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              aria-label={`Go to page ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === current ? "w-6 bg-accent-500" : "w-2 bg-slate-300 hover:bg-slate-400"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
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
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <AccentTitle>Project Progress</AccentTitle>
            <p className="mt-2 text-sm text-slate-500">Active projects and their current stage</p>
          </div>
          {showMasters && (
            <button
              type="button"
              onClick={() => router.push("/masters/projects")}
              className="group flex shrink-0 items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700"
            >
              View all
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
        </div>
        <ProjectCarousel
          projects={projectProgress}
          canOpen={showMasters}
          onOpen={() => router.push("/masters/projects")}
        />
      </div>
    ) : showProjects && projectProgress.length === 0 ? (
      <div>
        <div className="mb-4">
          <AccentTitle>Project Progress</AccentTitle>
          <p className="mt-2 text-sm text-slate-500">Active projects and their current stage</p>
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
