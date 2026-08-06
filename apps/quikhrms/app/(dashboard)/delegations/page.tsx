"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { useDialog } from "@/components/hrms/dialog";
import {
  UserCheck, Plus, Trash2, Pause, Play, Check,
  CalendarCheck, Receipt, Clock, Users, CalendarDays, TrendingUp, Folder, LogIn, Heart, BarChart3,
} from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { PageBackground } from "@/components/hrms/page-background";
import { Pagination } from "@/components/hrms/pagination";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { clsx } from "clsx";
import { TabSwitcher } from "@/components/hrms/tab-switcher";
import { DELEGATION_CATALOG, DELEGATION_PERM_LABELS } from "@/lib/rbac/delegatable";

interface EmpRef { id: string; firstName: string; lastName: string; employeeCode: string | null }
/** A stored module entry: legacy plain name, or the new {module, permissions} shape. */
type DelegationModule = string | { module: string; permissions: string[] };
interface Delegation {
  id: string; delegatorId: string; delegateeId: string; type: string;
  modules: DelegationModule[]; fromDate: string; toDate: string | null;
  notifyMode: string; description: string | null; isActive: boolean;
  delegator: EmpRef | null; delegatee: EmpRef | null;
}

/** Per-module icon + soft tile for the Modules & Permissions picker. */
const MODULE_UI: Record<string, { icon: React.ElementType; tile: string }> = {
  Leave:       { icon: CalendarCheck, tile: "bg-green-50 text-green-600" },
  Performance: { icon: TrendingUp,    tile: "bg-violet-50 text-violet-600" },
  Expense:     { icon: Receipt,       tile: "bg-emerald-50 text-emerald-600" },
  Document:    { icon: Folder,        tile: "bg-amber-50 text-amber-600" },
  Attendance:  { icon: Clock,         tile: "bg-indigo-50 text-indigo-600" },
  Boarding:    { icon: LogIn,         tile: "bg-teal-50 text-teal-600" },
  Recruitment: { icon: Users,         tile: "bg-orange-50 text-orange-600" },
  Engagement:  { icon: Heart,         tile: "bg-purple-50 text-purple-600" },
  Roster:      { icon: CalendarDays,  tile: "bg-blue-50 text-blue-600" },
  Reports:     { icon: BarChart3,     tile: "bg-sky-50 text-sky-600" },
};

function empName(e: EmpRef | null, fallbackId: string): string {
  if (!e) return fallbackId;
  const name = `${e.firstName} ${e.lastName}`.trim();
  return name || e.employeeCode || fallbackId;
}

/**
 * Delegatable modules and their authorities live in one shared catalog
 * (lib/rbac/delegatable.ts) so the picker here and the server-side grant logic
 * in with-auth can never drift. A module is offered only when the signed-in user
 * holds ≥1 of its permissions; within a module, only the permissions the user
 * actually has are selectable.
 */
function permLabel(code: string): string {
  return DELEGATION_PERM_LABELS[code] ?? code.split(".").pop() ?? code;
}
function moduleName(m: DelegationModule): string {
  return typeof m === "string" ? m : m.module;
}
function modulePerms(m: DelegationModule): string[] {
  return typeof m === "string" || !Array.isArray(m.permissions) ? [] : m.permissions;
}

export default function DelegationsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const [tab, setTab] = useState<"self" | "received">("self");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [showAdd, setShowAdd] = useState(false);
  const { permissions } = useDashboardConfig();
  // form.selections maps a module name → the permission codes chosen to delegate.
  const [form, setForm] = useState({
    delegateeId: "", type: "DelegationTemporary", fromDate: "", toDate: "",
    notifyMode: "NotifyBoth", description: "", selections: {} as Record<string, string[]>,
  });

  // Only modules where the signed-in user holds ≥1 delegatable permission, each
  // narrowed to just the permissions they actually have.
  const availableModules = useMemo(() => {
    const has = (code: string) => permissions.includes(code) || permissions.includes("*");
    return DELEGATION_CATALOG
      .map((m) => ({ ...m, permissions: m.permissions.filter((p) => has(p.code)) }))
      .filter((m) => m.permissions.length > 0);
  }, [permissions]);

  const { data } = useQuery({
    queryKey: ["delegations", tab],
    queryFn: () => api.get<Delegation[]>(`/api/v1/hrms/delegations?scope=${tab}&limit=100`),
  });

  const { data: subData } = useQuery({
    queryKey: ["employees", "me", "subordinates"],
    queryFn: () => api.get<{ employeeId: string | null; subordinateIds: string[] }>("/api/v1/hrms/employees/me/subordinates"),
    staleTime: 60_000,
  });
  const excludeIds = useMemo(() => {
    const out: string[] = [];
    if (subData?.data?.employeeId) out.push(subData.data.employeeId);
    if (subData?.data?.subordinateIds) out.push(...subData.data.subordinateIds);
    return out;
  }, [subData]);

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/delegations", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["delegations"] }); setShowAdd(false); },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.put(`/api/v1/hrms/delegations/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delegations"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/delegations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delegations"] }),
  });

  // Toggling a module on defaults to delegating all of its available permissions.
  const toggleModule = (mod: (typeof availableModules)[number]) => {
    setForm((f) => {
      const next = { ...f.selections };
      if (next[mod.module]) delete next[mod.module];
      else next[mod.module] = mod.permissions.map((p) => p.code);
      return { ...f, selections: next };
    });
  };
  // Toggling the last permission off removes the module entirely.
  const togglePermission = (moduleKey: string, code: string) => {
    setForm((f) => {
      const cur = f.selections[moduleKey] ?? [];
      const codes = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
      const next = { ...f.selections };
      if (codes.length) next[moduleKey] = codes;
      else delete next[moduleKey];
      return { ...f, selections: next };
    });
  };

  const items = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <UserCheck className="text-[#22c55e]" />
          <h1 className="text-base font-semibold text-gray-900">Delegations</h1>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 btn btn-primary text-xs font-medium px-3 py-1.5">
          <Plus size={13} /> New Delegation
        </button>
      </div>

      <TabSwitcher
        className="mb-4"
        value={tab}
        onChange={(v) => { setTab(v as "self" | "received"); setPage(1); }}
        tabs={[
          { value: "self", label: "My Delegations" },
          { value: "received", label: "Delegated to Me" },
        ]}
      />

      {items.length === 0 ? (
        <div className="p-1"><EmptyState variant="bot" title="No Data Found" className="border border-gray-200 shadow-sm" /></div>
      ) : (
        <div className="space-y-3">
          {pageItems.map((d, i) => (
            <div key={d.id} className={clsx("row-stagger bg-white rounded-lg shadow-sm border border-gray-200 p-4", !d.isActive && "opacity-60")} style={{ ["--i" as never]: Math.min(i, 10) }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-gray-900">{empName(d.delegator, d.delegatorId)}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-[13px] font-semibold text-gray-900">{empName(d.delegatee, d.delegateeId)}</span>
                    <span className="px-2 py-0.5 bg-[#dcfce7] text-[#16a34a] rounded-full text-[11px] font-medium">{d.type.replace("Delegation", "")}</span>
                    <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium", d.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                      {d.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(d.fromDate).toLocaleDateString("en-IN")} → {d.toDate ? new Date(d.toDate).toLocaleDateString("en-IN") : "∞"}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {d.modules.map((m, mi) => {
                      const perms = modulePerms(m);
                      return (
                        <span key={mi} title={perms.map(permLabel).join(", ") || undefined}
                          className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[11px] font-medium">
                          {moduleName(m)}{perms.length ? ` · ${perms.length}` : ""}
                        </span>
                      );
                    })}
                  </div>
                  {d.description && <div className="text-xs text-gray-600 mt-2">{d.description}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleMut.mutate({ id: d.id, isActive: !d.isActive })}
                    className="p-1.5 text-gray-600 hover:bg-gray-100 rounded">
                    {d.isActive ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                  <button onClick={async () => {
                    const ok = await dialog.confirm({
                      title: "Delete delegation?",
                      description: "This delegation will be permanently removed.",
                      variant: "danger",
                      confirmLabel: "Delete",
                    });
                    if (ok) deleteMut.mutate(d.id);
                  }} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={12} /></button>
                </div>
              </div>
            </div>
          ))}
          <Pagination page={page} totalPages={totalPages} total={items.length} limit={PAGE_SIZE} onPageChange={setPage} className="border-t-0 px-0" />
        </div>
      )}

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="New Delegation"
        subtitle="Delegate tasks and responsibilities to another employee"
        size="2xl"
        bodyClassName="p-0 flex flex-col min-h-0"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const today = new Date(); today.setHours(0, 0, 0, 0);
            if (form.fromDate && new Date(form.fromDate) < today) { alert("From date cannot be in the past."); return; }
            if (form.toDate && new Date(form.toDate) <= new Date(form.fromDate)) { alert("To date must be after From date."); return; }
            const modules = Object.entries(form.selections).map(([module, perms]) => ({ module, permissions: perms }));
            if (modules.length === 0) { alert("Select at least one module and permission to delegate."); return; }
            const { selections: _selections, ...rest } = form;
            createMut.mutate({ ...rest, modules, toDate: form.toDate || undefined });
          }}
          className="flex flex-col min-h-0 flex-1"
        >
          <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div>
                <EmployeeSelect
                  label="Delegatee"
                  required
                  value={form.delegateeId}
                  onChange={(id) => setForm({ ...form, delegateeId: id })}
                  excludeIds={excludeIds}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1.5">Notify</label>
                <Select
                  value={form.notifyMode}
                  onChange={(v) => setForm({ ...form, notifyMode: v })}
                  options={[
                    { value: "NotifyBoth", label: "Both" },
                    { value: "NotifyDelegatee", label: "Delegatee only" },
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1.5">From</label>
                <input type="date" required min={new Date().toISOString().slice(0, 10)}
                  value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1.5">To <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="date" min={form.fromDate || new Date().toISOString().slice(0, 10)}
                  value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Modules &amp; Permissions</label>
              {availableModules.length === 0 ? (
                <p className="text-xs text-gray-500">You don&apos;t have any permissions available to delegate.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {availableModules.map((mod) => {
                    const selected = form.selections[mod.module] ?? null;
                    const isOn = selected !== null;
                    const ui = MODULE_UI[mod.module] ?? { icon: UserCheck, tile: "bg-gray-100 text-gray-500" };
                    const Icon = ui.icon;
                    return (
                      <div key={mod.module}
                        className={clsx("rounded-xl border p-3 transition", isOn ? "border-green-400 bg-green-50/40" : "border-gray-200 hover:border-gray-300")}>
                        <button type="button" onClick={() => toggleModule(mod)} className="flex items-center gap-3 w-full text-left">
                          <span className={clsx("flex h-5 w-5 items-center justify-center rounded-md border shrink-0",
                            isOn ? "bg-green-600 border-green-600 text-white" : "border-gray-300 bg-white")}>
                            {isOn && <Check size={13} />}
                          </span>
                          <span className={clsx("w-9 h-9 rounded-lg grid place-items-center shrink-0", ui.tile)}><Icon size={17} /></span>
                          <span className="text-sm font-medium text-gray-800">{mod.label}</span>
                        </button>
                        {isOn && mod.permissions.length > 1 && (
                          <div className="flex flex-wrap gap-1.5 mt-2.5 pl-[68px]">
                            {mod.permissions.map((p) => {
                              const on = selected!.includes(p.code);
                              return (
                                <button key={p.code} type="button" onClick={() => togglePermission(mod.module, p.code)}
                                  className={clsx("px-2 py-0.5 rounded-md border text-[11px] transition",
                                    on ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-300 hover:border-gray-400")}>
                                  {p.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2} placeholder="Add a note about this delegation…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400" />
            </div>
          </div>

          <div className="border-t border-gray-100 px-6 py-3.5 flex items-center justify-between shrink-0">
            <button type="button" onClick={() => setShowAdd(false)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={createMut.isPending}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 shadow-sm disabled:opacity-50 transition">
              {createMut.isPending ? "Creating…" : "Create Delegation"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
