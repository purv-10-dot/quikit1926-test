"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileSpreadsheet, Upload, Download, Plus, ChevronRight, ChevronDown,
  FolderOpen, Folder, FileText, Search, List, LayoutGrid, SlidersHorizontal,
  Lock, Unlock, AlertTriangle, Pencil, Trash2, X, Loader2,
} from "lucide-react";
import { PageContainer, EmptyState, PrimaryButton, SecondaryButton } from "@/components/PageShell";
import { QuickCreateDrawer, exportCSV } from "@/components/QuickCreateDrawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SelectInput } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
const BOQImportDrawer = dynamic(
  () => import("./BOQImportDrawer").then((m) => m.BOQImportDrawer),
  { ssr: false },
);
import { useBOQInfinite } from "@/hooks/use-projects";
import { useProjects } from "@/hooks/use-masters";
import { getCurrentFY } from "@/lib/validators";
import { toast } from "@/lib/toast";

interface BoqNode {
  id?: string;
  boqNo: string;
  parentBoqNo?: string | null;
  isGroup?: boolean;
  description?: string;
  displayName?: string;
  category?: string;
  uomCode?: string;
  unit?: string;
  quantity?: number | string | null;
  tenderQty?: number | string | null;
  contractRate?: number | string | null;
  rate?: number | string | null;
  scopeQty?: number | string | null;
  subDoneQty?: number | string | null;
  selfDoneQty?: number | string | null;
  billedQty?: number | string | null;
  startDate?: string | null;
  endDate?: string | null;
}

interface BoqSummary {
  contractValue?: number;
  executedValue?: number;
  progressPercent?: number;
  groupCount?: number;
  leafCount?: number;
}

interface BoqLockState {
  isLocked: boolean;
  lockedBy?: string | null;
  lockedAt?: string | null;
}

export default function BOQPage() {
  const qc = useQueryClient();
  const [selectedProject, setSelectedProject] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);
  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const [editTarget, setEditTarget] = useState<BoqNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BoqNode | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: projectsData } = useProjects();

  // Single helper so any mutation refreshes BOTH the legacy non-paged
  // BOQ query (used elsewhere) AND this page's infinite-scroll cache.
  const invalidateBOQ = () => {
    qc.invalidateQueries({ queryKey: ["boq"] });
    qc.invalidateQueries({ queryKey: ["boq-infinite"] });
  };

  // Infinite scroll: each page request returns 100 BOQ rows. The summary
  // / lockState are computed server-side on the FULL tree, so they stay
  // accurate across pages — we just read them from the first page.
  const {
    data: boqResult,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useBOQInfinite(selectedProject || null, { pageSize: 100 });

  const allItems: BoqNode[] = useMemo(
    () => (boqResult?.pages ?? []).flatMap((p) => p.data ?? []) as unknown as BoqNode[],
    [boqResult],
  );
  const summary: BoqSummary = boqResult?.pages?.[0]?.summary ?? {};
  const lockState: BoqLockState =
    boqResult?.pages?.[0]?.lockState ?? { isLocked: false };

  // IntersectionObserver loads the next page when the sentinel <div> at
  // the bottom of the table scrolls into view. `rootMargin: '300px'`
  // pre-fetches just before the user reaches the end so the experience
  // feels seamless instead of jerky.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (!hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            fetchNextPage();
          }
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, allItems.length]);

  // Lock/unlock handlers
  const handleLock = async () => {
    if (!selectedProject) return;
    if (!confirm("Lock this BOQ? Once locked, Tender Qty and Rate become read-only. Only Super Admin can unlock.")) return;
    const res = await fetch(`/api/projects/${selectedProject}/boq/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lockedBy: "Project Manager" }),
    });
    if (res.ok) {
      invalidateBOQ();
      toast.success("BOQ locked");
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Failed to lock BOQ");
    }
  };
  const confirmDelete = async () => {
    if (!deleteTarget || !selectedProject) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/projects/${selectedProject}/boq/${deleteTarget.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to delete BOQ item");
      }
      invalidateBOQ();
      setDeleteTarget(null);
      toast.success("BOQ item deleted");
    } catch (err: unknown) {
      toast.error(toErrorMessage(err, "Failed to delete BOQ item"));
    } finally {
      setDeleting(false);
    }
  };

  const handleUnlock = async () => {
    if (!selectedProject) return;
    if (!confirm("Unlock this BOQ? This requires Super Admin authority and will be audited.")) return;
    const res = await fetch(`/api/projects/${selectedProject}/boq/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unlockedBy: "Super Admin" }),
    });
    if (res.ok) {
      invalidateBOQ();
      toast.success("BOQ unlocked");
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Failed to unlock BOQ");
    }
  };

  // Filter by category + search
  const items = useMemo(() => {
    let filtered = allItems;
    if (categoryFilter !== "all") filtered = filtered.filter((i) => (i.category ?? "").toLowerCase() === categoryFilter.toLowerCase());
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((i) => (i.description ?? "").toLowerCase().includes(q) || (i.boqNo ?? "").toLowerCase().includes(q));
    }
    return filtered;
  }, [allItems, categoryFilter, searchQuery]);

  // Build tree
  const tree = useMemo(() => {
    const byParent: Record<string, BoqNode[]> = {};
    for (const item of items) {
      const pKey = item.parentBoqNo ?? "__root__";
      if (!byParent[pKey]) byParent[pKey] = [];
      byParent[pKey].push(item);
    }
    const allNos = new Set(items.map((i) => i.boqNo));
    const roots = items.filter((i) => !i.parentBoqNo || !allNos.has(i.parentBoqNo));
    return { roots, byParent };
  }, [items]);

  const toggleGroup = (boqNo: string) => {
    setExpandedGroups(prev => { const n = new Set(prev); n.has(boqNo) ? n.delete(boqNo) : n.add(boqNo); return n; });
  };
  const toggleExpandAll = () => {
    if (expandAll) { setExpandedGroups(new Set()); setExpandAll(false); }
    else { setExpandedGroups(new Set(items.filter((i) => i.isGroup).map((i) => i.boqNo))); setExpandAll(true); }
  };

  const categoryTabs = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of allItems) { const k = (i.category ?? "Other").toLowerCase(); c[k] = (c[k] || 0) + 1; }
    return [{ key: "all", label: "All", count: allItems.length }, ...Object.entries(c).map(([k, v]) => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), count: v }))];
  }, [allItems]);

  const addConfig = {
    title: "Add BOQ Item", subtitle: "Add a new billable line item",
    apiEndpoint: `/api/projects/${selectedProject}/boq`,
    fields: [
      { key: "description", label: "Work Description", type: "text" as const, required: true, placeholder: "e.g. PCC M10 for foundation", span: 2 as const },
      { key: "category", label: "Category", type: "select" as const, required: true, options: [{ value: "Civil", label: "Civil" }, { value: "Electrical", label: "Electrical" }, { value: "Road", label: "Road" }] },
      { key: "uomCode", label: "Unit", type: "text" as const, required: true, placeholder: "CUM / MT / SQM" },
      { key: "quantity", label: "Tender Quantity", type: "number" as const, required: true, placeholder: "0" },
      { key: "contractRate", label: "Contract Rate (₹)", type: "number" as const, required: true, placeholder: "0" },
      {
        key: "startDate",
        label: "Start Date",
        type: "date" as const,
        onChange: (v: string, formData: Record<string, string>) => {
          if (formData.endDate && v && formData.endDate < v) {
            return { endDate: "" };
          }
        },
      },
      {
        key: "endDate",
        label: "End Date",
        type: "date" as const,
        min: (f: Record<string, string>) => f.startDate || undefined,
      },
    ],
    onSuccess: () => invalidateBOQ(),
  };
  const importConfig = {
    title: "Upload BOQ Revision", subtitle: "Import from Excel (.xlsx)",
    apiEndpoint: `/api/projects/${selectedProject}/boq/import`,
    fields: [
      { key: "fileName", label: "File Name", type: "text" as const, required: true, placeholder: "BOQ_Budhni.xlsx" },
      { key: "sheetName", label: "Sheet", type: "select" as const, options: [{ value: "civil", label: "Civil" }, { value: "electrical", label: "Electrical" }, { value: "road", label: "Road" }] },
      { key: "notes", label: "Notes", type: "textarea" as const, placeholder: "Revision notes..." },
    ],
    onSuccess: () => invalidateBOQ(),
  };

  // Compute values for a node
  function nodeValues(node: BoqNode) {
    const tender = parseFloat(String(node.quantity ?? "")) || 0;
    const rate = parseFloat(String(node.contractRate ?? "")) || 0;
    const scope = parseFloat(String(node.scopeQty ?? "")) || 0;
    const subCo = parseFloat(String(node.subDoneQty ?? "")) || 0;
    const self = parseFloat(String(node.selfDoneQty ?? "")) || 0;
    const totalDone = subCo + self;
    const balance = tender - totalDone;
    const billed = parseFloat(String(node.billedQty ?? "")) || 0;
    const estimated = tender * rate;
    const billedAmt = billed * rate;
    const balanceAmt = (tender - totalDone) * rate;
    const pct = tender > 0 ? Math.min(100, Math.round((totalDone / tender) * 100)) : 0;
    return { tender, rate, scope, subCo, self, totalDone, balance, billed, estimated, billedAmt, balanceAmt, pct };
  }

  const INR = (v: number) => v !== 0 ? v.toLocaleString("en-IN") : "0";
  const NUM = (v: number) => v !== 0 ? v.toLocaleString("en-IN") : "0";

  function renderRows(nodes: BoqNode[], depth: number = 0): React.ReactNode[] {
    const result: React.ReactNode[] = [];
    for (const node of nodes) {
      const children = tree.byParent[node.boqNo] ?? [];
      const hasChildren = children.length > 0;
      const isGrp = node.isGroup || hasChildren;
      const isOpen = expandedGroups.has(node.boqNo);
      const v = nodeValues(node);
      const neg = v.tender < 0;

      // Group row styling
      const grpBg = isGrp ? (depth === 0 ? "bg-slate-50" : "bg-gray-50/70") : "";
      const grpText = isGrp ? "font-semibold" : "";
      const valColor = isGrp ? "text-indigo-700" : "";

      result.push(
        <tr key={node.id ?? node.boqNo} className={`border-b border-gray-200/60 hover:bg-orange-50/40 ${grpBg} ${neg ? "bg-red-50/40" : ""}`}>
          {/* BOQ No */}
          <td className="px-2 py-1.5 text-[11px] font-mono text-gray-500 whitespace-nowrap border-r border-gray-100">{node.boqNo}</td>

          {/* Description with folder/file icons + indent */}
          <td className="py-1.5 border-r border-gray-100 max-w-[350px]" style={{ paddingLeft: `${6 + depth * 20}px` }}>
            <div className="flex items-center gap-1">
              {isGrp ? (
                <button onClick={() => toggleGroup(node.boqNo)} className="flex items-center gap-0.5 shrink-0 p-0.5 rounded hover:bg-gray-200">
                  {isOpen ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
                  {isOpen ? <FolderOpen className="w-3.5 h-3.5 text-amber-500" /> : <Folder className="w-3.5 h-3.5 text-amber-500" />}
                </button>
              ) : (
                <FileText className="w-3 h-3 text-orange-400 shrink-0 ml-1" />
              )}
              <span className={`text-[11px] leading-tight truncate ${grpText} ${neg ? "text-red-700" : isGrp ? "text-gray-900" : "text-gray-700"}`} title={node.description}>
                {node.description}
              </span>
            </div>
          </td>

          {/* Unit */}
          <td className="px-1 py-1.5 text-[10px] text-center text-gray-500 border-r border-gray-100 uppercase">{node.uomCode || ""}</td>
          {/* Start Date */}
          <td className="px-1 py-1.5 text-[10px] text-center text-gray-600 border-r border-gray-100 font-mono whitespace-nowrap">{node.startDate ? String(node.startDate).slice(0, 10) : ""}</td>
          {/* End Date */}
          <td className="px-1 py-1.5 text-[10px] text-center text-gray-600 border-r border-gray-100 font-mono whitespace-nowrap">{node.endDate ? String(node.endDate).slice(0, 10) : ""}</td>
          {/* Rate */}
          <td className="px-1 py-1.5 text-[10px] text-right text-gray-600 border-r border-gray-100 font-mono">{v.rate > 0 ? INR(v.rate) : ""}</td>

          {/* ── Quantities ── */}
          <td className="px-1 py-1.5 text-[10px] text-right border-r border-gray-100 font-mono">{isGrp ? <span className={valColor}>{NUM(v.tender)}</span> : (v.tender !== 0 ? NUM(v.tender) : "")}</td>
          <td className="px-1 py-1.5 text-[10px] text-right border-r border-gray-100 font-mono">{isGrp ? <span className={valColor}>{NUM(v.scope)}</span> : (v.scope > 0 ? NUM(v.scope) : "")}</td>
          <td className="px-1 py-1.5 text-[10px] text-right border-r border-gray-100 font-mono">{isGrp ? <span className={valColor}>{NUM(v.subCo)}</span> : (v.subCo > 0 ? NUM(v.subCo) : "")}</td>
          <td className="px-1 py-1.5 text-[10px] text-right border-r border-gray-100 font-mono">{isGrp ? <span className={valColor}>{NUM(v.self)}</span> : (v.self > 0 ? NUM(v.self) : "")}</td>
          <td className={`px-1 py-1.5 text-[10px] text-right border-r border-gray-100 font-mono font-bold ${v.totalDone > 0 ? "text-green-700" : ""}`}>{isGrp ? <span className="text-green-700">{NUM(v.totalDone)}</span> : (v.totalDone > 0 ? NUM(v.totalDone) : "")}</td>
          <td className="px-1 py-1.5 text-[10px] text-right border-r border-gray-100 font-mono">{v.tender > 0 ? NUM(v.balance) : ""}</td>

          {/* Progress */}
          <td className="px-1 py-1.5 text-center border-r border-gray-100">
            {v.tender > 0 && (
              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                v.pct >= 100 ? "bg-green-100 text-green-700" :
                v.pct > 50 ? "bg-orange-100 text-orange-700" :
                v.pct > 0 ? "bg-orange-100 text-orange-700" :
                "bg-gray-100 text-gray-500"
              }`}>{v.pct}%</span>
            )}
          </td>

          {/* Actions — edit + delete. Hidden on group rollup rows (they
              aggregate children, nothing to edit), and disabled when BOQ
              is locked. */}
          <td className="px-1 py-1.5 text-center border-r border-gray-100 whitespace-nowrap">
            {!isGrp && (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditTarget(node)}
                  disabled={lockState.isLocked}
                  className="p-1 rounded hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 disabled:opacity-40 disabled:hover:bg-transparent"
                  title={lockState.isLocked ? "BOQ is locked" : "Edit item"}
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(node)}
                  disabled={lockState.isLocked}
                  className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-transparent"
                  title={lockState.isLocked ? "BOQ is locked" : "Delete item"}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </td>

          {/* Visual Bar */}
          <td className="px-1 py-1.5 w-28">
            {v.tender > 0 && (
              <div className="flex items-center gap-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all ${
                    v.pct >= 100 ? "bg-indigo-600" :
                    v.pct > 50 ? "bg-indigo-500" :
                    v.pct > 0 ? "bg-indigo-400" : ""
                  }`} style={{ width: `${v.pct}%` }} />
                </div>
                <span className="text-[9px] text-gray-500 w-8 text-right">{v.pct}%</span>
              </div>
            )}
            {isGrp && v.tender === 0 && (
              <div className="flex items-center gap-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div className="h-2 rounded-full bg-green-400" style={{ width: "9.67%" }} />
                </div>
                <span className="text-[9px] text-gray-500 w-8 text-right">—</span>
              </div>
            )}
          </td>
        </tr>
      );
      if (isOpen && hasChildren) result.push(...renderRows(children, depth + 1));
    }
    return result;
  }

  return (
    <>
      {/* Top toolbar matching reference UI */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Project selector */}
            <div className="min-w-[240px]">
              <SelectInput
                value={selectedProject}
                onChange={(v) => { setSelectedProject(v); setExpandedGroups(new Set()); setExpandAll(false); }}
                placeholder="Select Project..."
                options={(projectsData?.data ?? []).map((p) => ({
                  value: p.id,
                  label: `${p.code} — ${p.name}`,
                }))}
              />
            </div>
            {/* View toggle */}
            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
              <button onClick={() => setViewMode("tree")} className={`p-1.5 ${viewMode === "tree" ? "bg-gray-100" : "hover:bg-gray-50"}`}><List className="w-4 h-4 text-gray-600" /></button>
              <button onClick={() => setViewMode("list")} className={`p-1.5 ${viewMode === "list" ? "bg-gray-100" : "hover:bg-gray-50"}`}><LayoutGrid className="w-4 h-4 text-gray-600" /></button>
            </div>
            {/* Add Item */}
            <PrimaryButton
              onClick={() => !selectedProject ? toast.warning("Select a project first") : lockState.isLocked ? toast.warning("BOQ is locked. Unlock first to add items.") : setAddDrawerOpen(true)}
              disabled={lockState.isLocked}>
              <Plus className="w-4 h-4" /> Add Item
            </PrimaryButton>
            {/* Category tabs */}
            {categoryTabs.map(tab => (
              <button key={tab.key} onClick={() => setCategoryFilter(tab.key)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md ${categoryFilter === tab.key ? "bg-orange-100 text-orange-700" : "text-gray-500 hover:bg-gray-100"}`}>
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search BOQ items..." className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            {/* Upload Revision */}
            <PrimaryButton onClick={() => selectedProject ? setImportDrawerOpen(true) : toast.warning("Select a project first")}
              className="!bg-indigo-600 hover:!bg-indigo-700"
              disabled={lockState.isLocked}>
              <Upload className="w-4 h-4" /> Upload Revision
            </PrimaryButton>
            {/* Lock / Unlock */}
            {selectedProject && (lockState.isLocked ? (
              <SecondaryButton onClick={handleUnlock} className="!text-red-600 !border-red-300">
                <Unlock className="w-4 h-4" /> Unlock
              </SecondaryButton>
            ) : (
              <SecondaryButton onClick={handleLock} className="!text-green-600 !border-green-300">
                <Lock className="w-4 h-4" /> Lock BOQ
              </SecondaryButton>
            ))}
            <SecondaryButton onClick={() => exportCSV(items, "boq")}><Download className="w-4 h-4" /></SecondaryButton>
            {items.length > 0 && (
              <button onClick={toggleExpandAll} className="text-[11px] text-indigo-600 hover:underline font-medium whitespace-nowrap">
                {expandAll ? "Collapse" : "Expand All"}
              </button>
            )}
          </div>
        </div>
      </div>

      <PageContainer className="!p-3 !pt-2">
        {!selectedProject ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16">
            <EmptyState title="Select a project" description="Choose a project to view its BOQ." icon={<FileSpreadsheet className="w-8 h-8" />} />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Locked banner */}
            {lockState.isLocked && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs">
                <Lock className="w-4 h-4 text-amber-600" />
                <span className="font-semibold">BOQ Locked</span>
                <span className="text-amber-700">— Tender Qty and Rate are read-only. Contact Super Admin to unlock for revisions.</span>
                {lockState.lockedBy && <span className="ml-auto text-[10px] text-amber-600">Locked by {lockState.lockedBy} on {new Date(lockState.lockedAt ?? "").toLocaleDateString()}</span>}
              </div>
            )}
            {/* Summary strip */}
            <div className="flex items-center gap-5 px-4 py-2 border-b border-gray-100 bg-gradient-to-r from-indigo-50/60 to-white text-xs">
              <span><b>₹{INR(summary.contractValue ?? 0)}</b> Contract</span>
              <span className="text-green-700"><b>₹{INR(summary.executedValue ?? 0)}</b> Executed ({summary.progressPercent ?? 0}%)</span>
              <span className="text-amber-700"><b>{summary.groupCount ?? 0}</b> groups</span>
              <span className="text-orange-700"><b>{summary.leafCount ?? 0}</b> billable</span>
              <span className="text-gray-500 ml-auto">{getCurrentFY().label}</span>
            </div>

            {isLoading ? (
              <div className="p-6 animate-pulse space-y-2">{[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-6 bg-gray-100 rounded" />)}</div>
            ) : items.length === 0 ? (
              <div className="py-12"><EmptyState title="No BOQ items" description="Import from Excel or add manually." icon={<FileSpreadsheet className="w-8 h-8" />} /></div>
            ) : (
              <div className="overflow-x-auto max-h-[calc(100vh-240px)] overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10">
                    {/* Two-level header matching reference */}
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th rowSpan={2} className="px-2 py-1 text-left text-[9px] font-bold text-gray-500 uppercase border-r border-gray-200 w-20">BOQ No.</th>
                      <th rowSpan={2} className="px-2 py-1 text-left text-[9px] font-bold text-gray-500 uppercase border-r border-gray-200 min-w-[300px]">Description / Item Name</th>
                      <th rowSpan={2} className="px-1 py-1 text-center text-[9px] font-bold text-gray-500 uppercase border-r border-gray-200 w-12">Unit</th>
                      <th rowSpan={2} className="px-1 py-1 text-center text-[9px] font-bold text-gray-500 uppercase border-r border-gray-200 w-24">Start Date</th>
                      <th rowSpan={2} className="px-1 py-1 text-center text-[9px] font-bold text-gray-500 uppercase border-r border-gray-200 w-24">End Date</th>
                      <th rowSpan={2} className="px-1 py-1 text-right text-[9px] font-bold text-gray-500 uppercase border-r border-gray-200 w-16">Rate</th>
                      <th colSpan={6} className="px-1 py-1 text-center text-[9px] font-bold text-indigo-600 uppercase border-r border-gray-200 border-b border-gray-200">Quantities</th>
                      <th rowSpan={2} className="px-1 py-1 text-center text-[9px] font-bold text-gray-500 uppercase border-r border-gray-200 w-14">Progress</th>
                      <th rowSpan={2} className="px-1 py-1 text-center text-[9px] font-bold text-gray-500 uppercase border-r border-gray-200 w-16">Actions</th>
                      <th rowSpan={2} className="px-1 py-1 text-center text-[9px] font-bold text-gray-500 uppercase w-28">Visual</th>
                    </tr>
                    <tr className="bg-gray-50 border-b-2 border-gray-300">
                      <th className="px-1 py-1 text-right text-[8px] font-semibold text-gray-500 uppercase border-r border-gray-200 w-16">Tender</th>
                      <th className="px-1 py-1 text-right text-[8px] font-semibold text-gray-500 uppercase border-r border-gray-200 w-14">Scope</th>
                      <th className="px-1 py-1 text-right text-[8px] font-semibold text-gray-500 uppercase border-r border-gray-200 w-14">Sub.Co</th>
                      <th className="px-1 py-1 text-right text-[8px] font-semibold text-gray-500 uppercase border-r border-gray-200 w-14">Self</th>
                      <th className="px-1 py-1 text-right text-[8px] font-semibold text-green-600 uppercase border-r border-gray-200 w-16">Total Done</th>
                      <th className="px-1 py-1 text-right text-[8px] font-semibold text-gray-500 uppercase border-r border-gray-200 w-14">Balance</th>
                    </tr>
                  </thead>
                  <tbody>{renderRows(tree.roots)}</tbody>
                </table>
              </div>
            )}

            {/* Infinite-scroll sentinel — when this div scrolls into view,
                useBOQInfinite fires fetchNextPage(). The `rootMargin` on
                the IntersectionObserver pre-fetches before it's visible. */}
            {hasNextPage && (
              <div
                ref={sentinelRef}
                className="flex items-center justify-center py-6 text-xs text-gray-400"
              >
                {isFetchingNextPage ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading more BOQ items…
                  </span>
                ) : (
                  <span>Scroll to load more</span>
                )}
              </div>
            )}
          </div>
        )}
      </PageContainer>

      <QuickCreateDrawer open={addDrawerOpen} onClose={() => setAddDrawerOpen(false)} config={addConfig} />
      <BOQImportDrawer
        open={importDrawerOpen}
        onClose={() => setImportDrawerOpen(false)}
        projectId={selectedProject}
      />

      <BOQItemEditModal
        open={!!editTarget}
        item={editTarget}
        projectId={selectedProject}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          invalidateBOQ();
          setEditTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        tone="danger"
        title="Delete BOQ Item"
        confirmLabel="Delete"
        message={
          deleteTarget ? (
            <>
              Delete BOQ item{" "}
              <span className="font-semibold text-gray-900">
                {deleteTarget.boqNo}
              </span>
              {deleteTarget.description ? ` — ${deleteTarget.description}` : ""}?
              It will be hidden from the list but can be restored by an
              administrator.
            </>
          ) : null
        }
      />
    </>
  );
}

// ─── BOQ Item Edit Modal ────────────────────────────────────────────
//
// Small inline modal so we don't need to bend QuickCreateDrawer (which is
// POST-only). Fields mirror the Add drawer; on save we PUT to
// /api/projects/:projectId/boq/:itemId.
function BOQItemEditModal({
  open,
  item,
  projectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: BoqNode | null;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Civil Building");
  const [uomCode, setUomCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [contractRate, setContractRate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Hydrate on open
  useEffect(() => {
    if (open && item) {
      setDescription(item.description ?? item.displayName ?? "");
      setCategory(item.category ?? "Civil Building");
      setUomCode(item.uomCode ?? item.unit ?? "");
      setQuantity(
        item.quantity != null
          ? String(item.quantity)
          : item.tenderQty != null
          ? String(item.tenderQty)
          : ""
      );
      setContractRate(
        item.contractRate != null
          ? String(item.contractRate)
          : item.rate != null
          ? String(item.rate)
          : ""
      );
      // Date inputs need YYYY-MM-DD; the API may hand back ISO datetimes.
      setStartDate(item.startDate ? String(item.startDate).slice(0, 10) : "");
      setEndDate(item.endDate ? String(item.endDate).slice(0, 10) : "");
      setError("");
    }
  }, [open, item]);

  if (!open || !item) return null;

  const tenderNum = parseFloat(quantity) || 0;
  const rateNum = parseFloat(contractRate) || 0;
  const estimated = tenderNum * rateNum;

  const handleSave = async () => {
    setError("");
    if (!description.trim()) return setError("Description is required");
    if (startDate && endDate && endDate < startDate) {
      return setError("End Date cannot be earlier than Start Date");
    }
    if (quantity.trim() !== "" && parseFloat(quantity) < 0) {
      return setError("Tender Quantity cannot be negative");
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/boq/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          category,
          uomCode,
          quantity,
          contractRate,
          startDate: startDate || null,
          endDate: endDate || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update BOQ item");
      }
      onSaved();
    } catch (err: unknown) {
      setError(toErrorMessage(err, "Failed to update BOQ item"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 rounded-t-2xl">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Edit BOQ Item</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{item.boqNo}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Work Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="e.g. Earth work in excavation by mechanical means"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Category
              </label>
              <SelectInput
                value={category}
                onChange={setCategory}
                options={[
                  { value: "Civil Building", label: "Civil Building" },
                  { value: "Civil", label: "Civil" },
                  { value: "Road", label: "Road" },
                  { value: "Electrical", label: "Electrical" },
                  { value: "Plumbing", label: "Plumbing" },
                  { value: "Other", label: "Other" },
                ]}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Unit
              </label>
              <input
                type="text"
                value={uomCode}
                onChange={(e) => setUomCode(e.target.value.toUpperCase())}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                placeholder="CUM / MT / SQM"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Tender Quantity
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right tabular-nums"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Rate (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={contractRate}
                onChange={(e) => setContractRate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right tabular-nums"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">
                Estimated Amount
              </span>
              <span className="text-base font-bold text-indigo-900 tabular-nums">
                ₹
                {estimated.toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
            <p className="text-[10px] text-indigo-600 mt-1">
              = Tender Qty × Rate (auto-calculated)
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <SecondaryButton onClick={onClose} disabled={saving}>
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Pencil className="w-4 h-4" />
            )}{" "}
            Save Changes
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
