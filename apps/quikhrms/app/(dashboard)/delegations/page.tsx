"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { useDialog } from "@/components/hrms/dialog";
import { UserCheck, Plus, Trash2, Pause, Play, Check } from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { clsx } from "clsx";

interface EmpRef { id: string; firstName: string; lastName: string; employeeCode: string | null }
/** A stored module entry: legacy plain name, or the new {module, permissions} shape. */
type DelegationModule = string | { module: string; permissions: string[] };
interface Delegation {
  id: string; delegatorId: string; delegateeId: string; type: string;
  modules: DelegationModule[]; fromDate: string; toDate: string | null;
  notifyMode: string; description: string | null; isActive: boolean;
  delegator: EmpRef | null; delegatee: EmpRef | null;
}

function empName(e: EmpRef | null, fallbackId: string): string {
  if (!e) return fallbackId;
  const name = `${e.firstName} ${e.lastName}`.trim();
  return name || e.employeeCode || fallbackId;
}

/**
 * Delegatable modules and the specific authorities inside each. A module is
 * offered only when the signed-in user holds ≥1 of its permissions; within a
 * module, only the permissions the user actually has are selectable. Codes are
 * real `hrms.*` RBAC codes (lib/rbac/permissions.ts). Timesheet is intentionally
 * absent — it has no `hrms.timesheet.*` permission to gate on.
 */
const DELEGATION_CATALOG: {
  module: string;
  label: string;
  permissions: { code: string; label: string }[];
}[] = [
  { module: "Leave", label: "Leave", permissions: [
    { code: "hrms.leave.apply", label: "Apply Leave" },
    { code: "hrms.leave.approve", label: "Approve Leave" },
    { code: "hrms.leave.manage", label: "Manage Policies" },
  ] },
  { module: "Expense", label: "Expense", permissions: [
    { code: "hrms.expense.submit", label: "Submit Expense" },
    { code: "hrms.expense.approve", label: "Approve Expense" },
    { code: "hrms.expense.manage", label: "Manage Policies" },
  ] },
  { module: "Attendance", label: "Attendance", permissions: [
    { code: "hrms.attendance.punch", label: "Check In/Out" },
    { code: "hrms.attendance.approve", label: "Approve Regularizations" },
    { code: "hrms.attendance.manage", label: "Manage Policies" },
  ] },
  { module: "Recruitment", label: "Recruitment", permissions: [
    { code: "hrms.recruit.write", label: "Manage Recruitment" },
    { code: "hrms.recruit.offer", label: "Manage Offers" },
    { code: "hrms.recruit.interview", label: "Manage Interviews" },
  ] },
  { module: "Roster", label: "Duty Roster", permissions: [
    { code: "hrms.roster.manage", label: "Manage Rosters" },
  ] },
  { module: "Performance", label: "Performance", permissions: [
    { code: "hrms.performance.write", label: "Manage Goals" },
    { code: "hrms.performance.appraise", label: "Run Appraisals" },
    { code: "hrms.performance.pip", label: "Manage PIPs" },
  ] },
  { module: "Document", label: "Document", permissions: [
    { code: "hrms.document.write", label: "Manage Documents" },
    { code: "hrms.document.acknowledge", label: "Acknowledge Documents" },
  ] },
  { module: "Boarding", label: "On/Offboarding", permissions: [
    { code: "hrms.onboarding.write", label: "Manage Onboarding" },
    { code: "hrms.offboarding.write", label: "Manage Offboarding" },
  ] },
  { module: "Engagement", label: "Engagement", permissions: [
    { code: "hrms.engage.announce", label: "Publish Announcements" },
    { code: "hrms.engage.survey.manage", label: "Manage Surveys" },
    { code: "hrms.engage.approve", label: "Approve Engagement" },
  ] },
  { module: "Reports", label: "Reports", permissions: [
    { code: "hrms.reports.manage", label: "Manage Report Templates" },
  ] },
];

const PERM_LABELS: Record<string, string> = Object.fromEntries(
  DELEGATION_CATALOG.flatMap((m) => m.permissions.map((p) => [p.code, p.label] as const)),
);
function permLabel(code: string): string {
  return PERM_LABELS[code] ?? code.split(".").pop() ?? code;
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

  return (
    <div>
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

      <div className="flex items-center gap-2 mb-4">
        {(["self", "received"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx("px-4 py-2 rounded-lg text-[13px] font-semibold", tab === t ? "bg-green-600 text-white" : "bg-white border border-[var(--border)] text-gray-700")}>
            {t === "self" ? "My Delegations" : "Delegated to Me"}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="p-1"><EmptyState variant="bot" title="No Data Found" className="border border-gray-200 shadow-sm" /></div>
      ) : (
        <div className="space-y-3">
          {items.map((d, i) => (
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
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Delegation">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const today = new Date(); today.setHours(0, 0, 0, 0);
            if (form.fromDate && new Date(form.fromDate) < today) {
              alert("From date cannot be in the past.");
              return;
            }
            if (form.toDate && new Date(form.toDate) <= new Date(form.fromDate)) {
              alert("To date must be after From date.");
              return;
            }
            const modules = Object.entries(form.selections).map(([module, perms]) => ({ module, permissions: perms }));
            if (modules.length === 0) {
              alert("Select at least one module and permission to delegate.");
              return;
            }
            const { selections: _selections, ...rest } = form;
            createMut.mutate({ ...rest, modules, toDate: form.toDate || undefined });
          }}
          className="space-y-4"
        >
          <EmployeeSelect
            label="Delegatee"
            required
            value={form.delegateeId}
            onChange={(id) => setForm({ ...form, delegateeId: id })}
            excludeIds={excludeIds}
          />
          <p className="-mt-2 text-xs text-gray-500">
            You can&apos;t delegate to yourself or to your direct/indirect reports.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Notify</label>
              <Select
                value={form.notifyMode}
                onChange={(v) => setForm({ ...form, notifyMode: v })}
                options={[
                  { value: "NotifyBoth", label: "Both" },
                  { value: "NotifyDelegatee", label: "Delegatee only" },
                ]}
              /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">From</label>
              <input
                type="date"
                required
                min={new Date().toISOString().slice(0, 10)}
                value={form.fromDate}
                onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs"
              /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">To (optional)</label>
              <input
                type="date"
                min={form.fromDate || new Date().toISOString().slice(0, 10)}
                value={form.toDate}
                onChange={(e) => setForm({ ...form, toDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs"
              /></div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Modules &amp; Permissions</label>
            {availableModules.length === 0 ? (
              <p className="text-xs text-gray-500">You don&apos;t have any permissions available to delegate.</p>
            ) : (
              <div className="space-y-2">
                {availableModules.map((mod) => {
                  const selected = form.selections[mod.module] ?? null;
                  const isOn = selected !== null;
                  return (
                    <div key={mod.module}
                      className={clsx("rounded-lg border p-2", isOn ? "border-green-500 bg-green-50/40" : "border-gray-200")}>
                      <button type="button" onClick={() => toggleModule(mod)}
                        className="flex items-center gap-2 w-full text-left">
                        <span className={clsx("flex h-4 w-4 items-center justify-center rounded border",
                          isOn ? "bg-green-600 border-green-600 text-white" : "border-gray-300")}>
                          {isOn && <Check size={11} />}
                        </span>
                        <span className="text-xs font-medium text-gray-800">{mod.label}</span>
                      </button>
                      {isOn && (
                        <div className="flex flex-wrap gap-1.5 mt-2 pl-6">
                          {mod.permissions.map((p) => {
                            const on = selected!.includes(p.code);
                            return (
                              <button key={p.code} type="button" onClick={() => togglePermission(mod.module, p.code)}
                                className={clsx("px-2 py-0.5 rounded-md border text-[11px]",
                                  on ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-300")}>
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
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" rows={2} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" disabled={createMut.isPending} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
