"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/select";
import { PageBackground } from "@/components/hrms/page-background";
import {
  Plus, Pencil, Trash2, Users, X, Home, Search, Shield, UserCircle, Check,
  ChevronRight, Clock, CalendarDays, Building2, SlidersHorizontal,
} from "lucide-react";

// Avatar palette for employee initials in the member table.
const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];
function initials(first?: string | null, last?: string | null) {
  const s = `${(first?.[0] ?? "").toUpperCase()}${(last?.[0] ?? "").toUpperCase()}`;
  return s || "?";
}
import { clsx } from "clsx";
import { PageHeader } from "@/components/hrms/ui/page-header";

type GroupMode = "Department" | "Employee";

interface Group {
  id: string;
  name: string;
  description: string | null;
  yearlyQuota: number;
  mode: GroupMode;
  isActive: boolean;
  // Rules
  maxPerWeek: number | null;
  maxPerMonth: number | null;
  maxConsecutiveDays: number | null;
  advanceNoticeDays: number | null;
  applicableAfterDays: number | null;
  requiresApproval: boolean;
  blockedDuringNotice: boolean;
  _count: { members: number };
}

type FormShape = {
  name: string;
  description: string;
  yearlyQuota: number;
  mode: GroupMode;
  isActive: boolean;
  maxPerMonth: number | null;
  maxConsecutiveDays: number | null;
  advanceNoticeDays: number | null;
  applicableAfterDays: number | null;
  blockedDuringNotice: boolean;
};

const EMPTY_FORM: FormShape = {
  name: "", description: "", yearlyQuota: 60, mode: "Employee", isActive: true,
  maxPerMonth: null, maxConsecutiveDays: null,
  advanceNoticeDays: null, applicableAfterDays: null,
  blockedDuringNotice: false,
};

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  department: { name: string } | null;
}

interface DeptLink {
  id: string;
  department: { id: string; name: string; code: string | null; _count: { employees: number } };
}

interface GroupDetail extends Group {
  members: Member[];
  departments: DeptLink[];
}

interface DeptOption { id: string; name: string; code: string | null }

export default function WfhQuotaPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm } = useDialog();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"main" | "rules">("main");
  const [showAssign, setShowAssign] = useState(false);
  const [moveDelete, setMoveDelete] = useState<{ id: string; name: string } | null>(null);
  const [deptToAdd, setDeptToAdd] = useState("");

  const [form, setForm] = useState<FormShape>({ ...EMPTY_FORM });

  const { data, isLoading } = useQuery({
    queryKey: ["wfh-quota-groups"],
    queryFn: () => api.get<Group[]>("/api/v1/hrms/wfh/quota-groups"),
  });
  const groups = data?.data ?? [];

  const { data: detailData } = useQuery({
    queryKey: ["wfh-quota-groups", activeGroupId],
    queryFn: () => api.get<GroupDetail>(`/api/v1/hrms/wfh/quota-groups/${activeGroupId}`),
    enabled: !!activeGroupId,
  });
  const detail = detailData?.data;

  const resetForm = () => setForm({ ...EMPTY_FORM });

  const refreshAll = async () => {
    await qc.invalidateQueries({ queryKey: ["wfh-quota-groups"] });
  };

  const createMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/wfh/quota-groups", form),
    onSuccess: async () => { toast.success("Group created"); await refreshAll(); setShowCreate(false); resetForm(); },
  });

  const updateMut = useMutation({
    mutationFn: () => api.patch(`/api/v1/hrms/wfh/quota-groups/${editing?.id}`, form),
    onSuccess: async () => { toast.success("Group updated"); await refreshAll(); setEditing(null); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/wfh/quota-groups/${id}`),
    onSuccess: async () => { toast.success("Group deleted"); await refreshAll(); if (activeGroupId) setActiveGroupId(null); },
  });

  const removeMemberMut = useMutation({
    mutationFn: (empId: string) => api.delete(`/api/v1/hrms/wfh/quota-groups/${activeGroupId}/members?employeeId=${empId}`),
    onSuccess: async () => {
      toast.success("Removed");
      await qc.invalidateQueries({ queryKey: ["wfh-quota-groups"] });
    },
  });

  const { data: deptsData } = useQuery({
    queryKey: ["departments", "active"],
    queryFn: () => api.get<DeptOption[]>("/api/v1/hrms/departments?limit=200"),
  });
  const allDepts: DeptOption[] = deptsData?.data ?? [];

  const addDeptMut = useMutation({
    mutationFn: (departmentId: string) => api.post(`/api/v1/hrms/wfh/quota-groups/${activeGroupId}/departments`, { departmentIds: [departmentId] }),
    onSuccess: async () => {
      toast.success("Department assigned");
      await qc.invalidateQueries({ queryKey: ["wfh-quota-groups"] });
      setDeptToAdd("");
    },
  });

  const removeDeptMut = useMutation({
    mutationFn: (departmentId: string) => api.delete(`/api/v1/hrms/wfh/quota-groups/${activeGroupId}/departments?departmentId=${departmentId}`),
    onSuccess: async () => {
      toast.success("Department removed");
      await qc.invalidateQueries({ queryKey: ["wfh-quota-groups"] });
    },
  });

  // Delete flow: a group with employees can't be deleted until they're moved
  // to another group. Empty groups delete via a plain confirm.
  const requestDelete = async (g: { id: string; name: string; mode: GroupMode; memberCount: number }) => {
    if (g.mode === "Employee" && g.memberCount > 0) {
      setMoveDelete({ id: g.id, name: g.name });
      return;
    }
    const ok = await confirm({
      title: `Delete group "${g.name}"?`,
      description: "This cannot be undone.",
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (ok) deleteMut.mutate(g.id);
  };

  const startEdit = (g: Group) => {
    setEditing(g);
    setForm({
      name: g.name, description: g.description ?? "", yearlyQuota: g.yearlyQuota, mode: g.mode, isActive: g.isActive,
      maxPerMonth: g.maxPerMonth ?? null, maxConsecutiveDays: g.maxConsecutiveDays ?? null,
      advanceNoticeDays: g.advanceNoticeDays ?? null, applicableAfterDays: g.applicableAfterDays ?? null,
      blockedDuringNotice: g.blockedDuringNotice ?? false,
    });
  };

  const inputCls = "w-full px-3 py-2 border border-[var(--border)] rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]";

  // Logical validation of the WFH rule limits against the yearly quota + each
  // other (e.g. a month can't allow more days than the whole year).
  const quota = form.yearlyQuota > 0 ? form.yearlyQuota : null;
  const monthCap = quota != null ? Math.min(31, quota) : 31;
  const ruleError = (key: keyof FormShape): string => {
    const v = form[key];
    if (typeof v !== "number") return "";
    if (v < 0) return "Must be 0 or more.";
    if (key === "maxPerMonth") {
      if (quota != null && v > quota) return `Can't exceed the yearly quota (${quota}).`;
      if (v > 31) return "A month has at most 31 days.";
    }
    if (key === "maxConsecutiveDays") {
      const cap = form.maxPerMonth ?? monthCap;
      if (v > cap) return `Can't exceed ${form.maxPerMonth != null ? "Max / month" : "the monthly limit"} (${cap}).`;
    }
    if (key === "advanceNoticeDays" && v > 60) return "Keep it 60 days or less.";
    if (key === "applicableAfterDays" && v > 365) return "Keep it 365 days or less.";
    return "";
  };
  const hasRuleErrors = (["maxPerMonth", "maxConsecutiveDays", "advanceNoticeDays", "applicableAfterDays"] as const)
    .some((k) => ruleError(k) !== "");

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <PageHeader
        icon={<Home size={28} className="text-[#22c55e]" />}
        title="WFH quota groups"
        subtitle="Define yearly day limits and assign employees."
        actions={
          <button onClick={() => { resetForm(); setShowCreate(true); }} className="btn btn-primary">
            <Plus size={13} /> New group
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-2">
          {isLoading ? (
            <div className="text-xs text-gray-500 py-8 text-center">Loading...</div>
          ) : groups.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-xs text-gray-500">
              No groups yet. Create one to start.
            </div>
          ) : (
            groups.map((g, i) => {
              const active = activeGroupId === g.id;
              return (
                <div
                  key={g.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setActiveGroupId(g.id); setDetailTab("main"); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setActiveGroupId(g.id); setDetailTab("main"); } }}
                  className={clsx(
                    "row-stagger w-full cursor-pointer text-left rounded-xl border p-3.5 transition",
                    active ? "border-green-500 bg-green-50/60 ring-1 ring-green-500/20" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm",
                  )}
                  style={{ ["--i" as never]: Math.min(i, 10) }}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={clsx("h-9 w-9 shrink-0 rounded-lg grid place-items-center", active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                      <Users size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[13px] font-semibold text-gray-900 truncate">{g.name}</h3>
                        <span className={clsx(
                          "text-[9.5px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide",
                          g.mode === "Department" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700",
                        )}>
                          {g.mode === "Department" ? "Dept" : "Emp"}
                        </span>
                        {!g.isActive && <span className="text-[9.5px] font-semibold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded uppercase tracking-wide">Inactive</span>}
                      </div>
                      {g.description && <p className="text-[11.5px] text-gray-500 mt-0.5 truncate">{g.description}</p>}
                    </div>
                    <ChevronRight size={15} className={clsx("shrink-0 mt-1", active ? "text-green-600" : "text-gray-300")} />
                  </div>
                  <div className="flex items-center justify-between mt-2.5 pl-[46px]">
                    <div className="flex items-center gap-4 text-[11px] text-gray-500">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {g.yearlyQuota} days/year</span>
                      {g.mode === "Employee" && <span className="inline-flex items-center gap-1"><Users size={12} /> {g._count.members} employee{g._count.members === 1 ? "" : "s"}</span>}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); startEdit(g); }} className="p-1.5 rounded hover:bg-white text-gray-400 hover:text-[#166534]"><Pencil size={13} /></button>
                      <button
                        onClick={(e) => { e.stopPropagation(); requestDelete({ id: g.id, name: g.name, mode: g.mode, memberCount: g._count.members }); }}
                        className="p-1.5 rounded hover:bg-white text-gray-400 hover:text-red-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="lg:col-span-2">
          {!activeGroupId ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 min-h-[420px] grid place-items-center text-center">
              <div>
                <Users size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">Select a group to view and manage members.</p>
              </div>
            </div>
          ) : !detail ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">Loading…</div>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              {/* header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="h-[52px] w-[52px] shrink-0 rounded-xl bg-green-100 text-green-700 grid place-items-center">
                    {detail.mode === "Department" ? <Building2 size={24} /> : <Users size={24} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[15px] font-bold text-gray-900">{detail.name}</h2>
                      <span className={clsx("text-[9.5px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide", detail.mode === "Department" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                        {detail.mode === "Department" ? "Dept-wise" : "Employee-wise"}
                      </span>
                      {!detail.isActive && <span className="text-[9.5px] font-semibold px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded uppercase tracking-wide">Inactive</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {detail.yearlyQuota} days/year</span>
                      <span className="text-gray-300">•</span>
                      <span className="inline-flex items-center gap-1"><Users size={12} /> {detail.mode === "Department" ? `${detail.departments.length} dept${detail.departments.length === 1 ? "" : "s"}` : `${detail.members.length} employee${detail.members.length === 1 ? "" : "s"}`}</span>
                    </p>
                    {detail.description && <p className="text-xs text-gray-400 mt-1 truncate">{detail.description}</p>}
                  </div>
                </div>
              </div>

              {/* tabs */}
              <div className="flex items-center gap-6 border-b border-gray-200 mt-5">
                <DetailTab active={detailTab === "main"} onClick={() => setDetailTab("main")} icon={detail.mode === "Department" ? <Building2 size={14} /> : <Users size={14} />} label={detail.mode === "Department" ? "Departments" : "Employees"} />
                <DetailTab active={detailTab === "rules"} onClick={() => setDetailTab("rules")} icon={<SlidersHorizontal size={14} />} label="Rules" />
              </div>

              <div className="mt-4">
                {/* MAIN — Employee mode */}
                {detailTab === "main" && detail.mode === "Employee" && (
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3.5">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Employees in this group ({detail.members.length})</h3>
                      </div>
                      <button onClick={() => setShowAssign(true)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold shadow-sm">
                        <Plus size={14} /> Assign employees
                      </button>
                    </div>
                    <MembersTable
                      key={detail.id}
                      members={detail.members}
                      onRemove={async (m) => {
                        const ok = await confirm({ title: `Remove ${m.firstName} ${m.lastName}?`, description: "They will no longer belong to this WFH quota group.", variant: "warning", confirmLabel: "Remove" });
                        if (ok) removeMemberMut.mutate(m.id);
                      }}
                    />
                  </div>
                )}

                {/* MAIN — Department mode */}
                {detailTab === "main" && detail.mode === "Department" && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Select
                        className="flex-1"
                        placeholder="Select department…"
                        value={deptToAdd}
                        onChange={(v) => setDeptToAdd(v)}
                        options={allDepts
                          .filter((d) => !detail.departments.some((dl) => dl.department.id === d.id))
                          .map((d) => ({ value: d.id, label: `${d.name}${d.code ? ` (${d.code})` : ""}` }))}
                      />
                      <button onClick={() => deptToAdd && addDeptMut.mutate(deptToAdd)} disabled={!deptToAdd || addDeptMut.isPending} className="btn btn-primary btn-sm h-[42px] whitespace-nowrap">
                        <Plus size={13} /> Add dept
                      </button>
                    </div>
                    {detail.departments.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
                        <Building2 size={24} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-xs text-gray-500">No departments assigned yet.</p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {detail.departments.map((dl) => (
                          <span key={dl.id} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-green-200 rounded-lg text-xs">
                            <span className="font-semibold text-green-900">{dl.department.name}</span>
                            <span className="text-green-500">· {dl.department._count.employees} emp</span>
                            <button
                              onClick={async () => {
                                const ok = await confirm({ title: `Remove "${dl.department.name}"?`, description: "Employees in this department will lose this group's quota (unless explicitly assigned).", variant: "warning", confirmLabel: "Remove" });
                                if (ok) removeDeptMut.mutate(dl.department.id);
                              }}
                              className="text-gray-400 hover:text-red-600"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* RULES */}
                {detailTab === "rules" && <RulesPanel group={detail} />}

              </div>

              {/* stat cards */}
              <div className="mt-5 rounded-xl bg-green-50/60 border border-green-100 grid grid-cols-2 md:grid-cols-4 divide-x divide-green-100">
                <Stat
                  icon={detail.mode === "Department" ? <Building2 size={17} /> : <Users size={17} />}
                  value={detail.mode === "Department" ? detail.departments.length : detail.members.length}
                  label={detail.mode === "Department" ? "Departments" : "Total Employees"}
                />
                <Stat icon={<CalendarDays size={17} />} value={detail.yearlyQuota} label="Days / Year" />
                <Stat icon={<Shield size={17} />} value={detail.mode === "Department" ? "Dept-wise" : "Employee-wise"} label="Group Type" small />
                <Stat icon={<Clock size={17} />} value={detail.isActive ? "Active" : "Inactive"} label="Status" small />
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={showCreate || !!editing} onClose={() => { setShowCreate(false); setEditing(null); resetForm(); }} title={editing ? "Edit group" : "New WFH quota group"} size="2xl">
        <form
          onSubmit={(e) => { e.preventDefault(); editing ? updateMut.mutate() : createMut.mutate(); }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {/* ── Left: group basics ─────────────────────────────────── */}
            <div className="space-y-3">
              <Field label="Name *">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required />
              </Field>
              <Field label="Description">
                <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Yearly quota (days) *">
                <input
                  type="number"
                  min={0}
                  max={366}
                  value={form.yearlyQuota}
                  onChange={(e) => setForm({ ...form, yearlyQuota: parseInt(e.target.value || "0", 10) })}
                  className={inputCls}
                  required
                />
              </Field>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                After creating the group, assign employees to it from the group panel.
              </p>
            </div>

            {/* ── Right: WFH rules (optional) ────────────────────────── */}
            <div className="space-y-3 md:border-l md:border-gray-100 md:pl-6">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">WFH rules (optional)</p>

              <label className="flex items-start gap-2.5 border border-gray-200 rounded-lg p-2.5 cursor-pointer hover:border-gray-300 transition">
                <input type="checkbox" className="mt-0.5 accent-green-600" checked={form.blockedDuringNotice} onChange={(e) => setForm({ ...form, blockedDuringNotice: e.target.checked })} />
                <span>
                  <span className="block text-[13px] font-semibold text-gray-800">Block during notice period</span>
                  <span className="block text-[11px] text-gray-500">Employees serving notice can't apply for WFH.</span>
                </span>
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                {([
                  { key: "maxPerMonth", label: "Max / month", hint: "days" },
                  { key: "maxConsecutiveDays", label: "Max consecutive", hint: "per request" },
                  { key: "advanceNoticeDays", label: "Advance notice", hint: "days before" },
                  { key: "applicableAfterDays", label: "Eligible after joining", hint: "days" },
                ] as const).map((r) => {
                  const err = ruleError(r.key);
                  return (
                  <div key={r.key}>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">{r.label} <span className="text-gray-400">({r.hint})</span></label>
                    <input
                      type="number"
                      min={0}
                      placeholder="No limit"
                      value={form[r.key] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm({ ...form, [r.key]: v === "" ? null : Math.max(0, parseInt(v, 10) || 0) });
                      }}
                      className={clsx(inputCls, err && "!border-red-400 focus:!ring-red-300")}
                    />
                    {err && <p className="text-[11px] text-red-600 mt-1">{err}</p>}
                  </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400">Leave a field blank for &ldquo;no limit&rdquo;.</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <button type="button" onClick={() => { setShowCreate(false); setEditing(null); resetForm(); }} className="btn btn-secondary btn-sm">Cancel</button>
            <button type="submit" disabled={createMut.isPending || updateMut.isPending || hasRuleErrors} className="btn btn-primary btn-sm">
              {editing ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>

      {showAssign && detail && (
        <WfhAssignModal
          groupId={detail.id}
          groupName={detail.name}
          onClose={() => setShowAssign(false)}
          onAssigned={async () => { await refreshAll(); await qc.invalidateQueries({ queryKey: ["wfh-quota-groups", detail.id] }); }}
        />
      )}

      {moveDelete && (
        <WfhMoveDeleteModal
          sourceId={moveDelete.id}
          sourceName={moveDelete.name}
          targets={groups.filter((g) => g.id !== moveDelete.id && g.mode === "Employee" && g.isActive).map((g) => ({ id: g.id, name: g.name }))}
          onClose={() => setMoveDelete(null)}
          onDeleted={async () => { await refreshAll(); if (activeGroupId === moveDelete.id) setActiveGroupId(null); setMoveDelete(null); }}
        />
      )}
    </div>
  );
}

function WfhMoveDeleteModal({ sourceId, sourceName, targets, onClose, onDeleted }: {
  sourceId: string; sourceName: string; targets: { id: string; name: string }[];
  onClose: () => void; onDeleted: () => void | Promise<void>;
}) {
  const api = useApiClient();
  const toast = useToast();
  const [target, setTarget] = useState("");
  const mut = useMutation({
    mutationFn: () => api.delete(`/api/v1/hrms/wfh/quota-groups/${sourceId}?moveToGroupId=${target}`),
    onSuccess: async () => { toast.success("Employees moved & group deleted"); await onDeleted(); },
    meta: { suppressGlobalError: true },
    onError: () => toast.error("Couldn't move & delete"),
  });
  return (
    <Modal open onClose={onClose} title={`Delete "${sourceName}"`} size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">This group still has employees assigned. Move them to another group, then it will be deleted.</p>
        {targets.length === 0 ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700">
            No other employee-wise group to move employees to. Create one first.
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Move employees to</label>
            <Select placeholder="Select a group…" value={target} onChange={(v) => setTarget(v)} options={targets.map((t) => ({ value: t.id, label: t.name }))} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button type="button" onClick={() => target && mut.mutate()} disabled={!target || mut.isPending} className="btn btn-danger btn-sm">
            <Trash2 size={13} /> Move &amp; delete
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

// ── WFH assign modal — By Employee / By Role, hide already-grouped, select all ──
interface AssignEmp {
  id: string; firstName: string; lastName: string; employeeCode: string | null;
  jobTitle: string | null; profilePhoto: string | null;
  wfhQuotaGroupId: string | null;
  appRoles: { roleId: string }[];
}
interface AssignRole { id: string; name: string; code: string }

function WfhAssignModal({ groupId, groupName, onClose, onAssigned }: {
  groupId: string; groupName: string; onClose: () => void; onAssigned: () => void | Promise<void>;
}) {
  const api = useApiClient();
  const toast = useToast();
  const [mode, setMode] = useState<"Employee" | "Role">("Employee");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data: empData } = useQuery({
    queryKey: ["employees", "wfh-assign"],
    queryFn: () => api.get<AssignEmp[]>("/api/v1/hrms/employees?limit=500&status=Active"),
  });
  const { data: roleData } = useQuery({
    queryKey: ["roles", "wfh-assign"],
    queryFn: () => api.get<AssignRole[]>("/api/v1/hrms/settings/roles"),
    enabled: mode === "Role",
  });

  const allEmps = empData?.data ?? [];
  // Hide anyone already in a WFH group (one employee = one group).
  const emps = allEmps.filter((e) => {
    if (e.wfhQuotaGroupId) return false;
    const hay = `${e.firstName} ${e.lastName} ${e.employeeCode ?? ""}`.toLowerCase();
    return !search || hay.includes(search.toLowerCase());
  });
  const roles = (roleData?.data ?? []).filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()));

  const visibleIds = mode === "Employee" ? emps.map((e) => e.id) : roles.map((r) => r.id);
  const allPicked = visibleIds.length > 0 && visibleIds.every((id) => picked.has(id));
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(visibleIds));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const assignMut = useMutation({
    mutationFn: (employeeIds: string[]) => api.post(`/api/v1/hrms/wfh/quota-groups/${groupId}/members`, { employeeIds }),
    onSuccess: async (_r, ids) => { toast.success(`${ids.length} employee${ids.length > 1 ? "s" : ""} assigned`); await onAssigned(); onClose(); },
    meta: { suppressGlobalError: true },
    onError: () => toast.error("Couldn't assign"),
  });

  const doAssign = () => {
    let ids: string[] = [];
    if (mode === "Employee") {
      ids = Array.from(picked);
    } else {
      // Snapshot: current holders of the picked role(s) who aren't already in a group.
      const holders = allEmps.filter((e) => picked.has(e.appRoles?.[0]?.roleId ?? ""));
      const addable = holders.filter((e) => !e.wfhQuotaGroupId);
      const skipped = holders.length - addable.length;
      if (addable.length === 0) {
        return toast.error(skipped > 0 ? "All holders of that role are already in a group." : "No members found for the selected role(s).");
      }
      if (skipped > 0) toast.info(`${skipped} already in a group — skipped.`);
      ids = addable.map((e) => e.id);
    }
    if (ids.length === 0) return toast.error("Select at least one.");
    assignMut.mutate(ids);
  };

  return (
    <Modal open onClose={onClose} title={`Assign to ${groupName}`} size="lg">
      <div className="space-y-3">
        <div className="flex items-center gap-1 border-b border-gray-200">
          <SubTab active={mode === "Employee"} onClick={() => { setMode("Employee"); setPicked(new Set()); setSearch(""); }} icon={<UserCircle size={13} />} label="By Employee" />
          <SubTab active={mode === "Role"} onClick={() => { setMode("Role"); setPicked(new Set()); setSearch(""); }} icon={<Shield size={13} />} label="By Role" />
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={mode === "Employee" ? "Search employees…" : "Search roles…"}
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#166534]" />
        </div>

        {mode === "Role" && (
          <p className="text-[11px] text-gray-400">Adds everyone who currently has the selected role(s). Anyone already in a group is skipped.</p>
        )}

        {visibleIds.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <button type="button" onClick={toggleAll} className="text-[11px] font-medium text-green-700 hover:underline">
              {allPicked ? "Clear all" : `Select all (${visibleIds.length})`}
            </button>
            {picked.size > 0 && <span className="text-[11px] text-gray-500">{picked.size} selected</span>}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto space-y-1 rounded-md border border-gray-100 p-1">
          {mode === "Employee" ? (
            emps.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">No available employees (everyone is already in a group).</div>
            ) : emps.map((e) => {
              const checked = picked.has(e.id);
              return (
                <button key={e.id} type="button" onClick={() => toggle(e.id)}
                  className={clsx("w-full flex items-center gap-2 px-2 py-1.5 rounded transition text-left",
                    checked ? "bg-[#f0fdf4] border border-[#bbf7d0]" : "hover:bg-gray-50 border border-transparent")}>
                  <div className={clsx("w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                    checked ? "border-[#16a34a] bg-[#16a34a] text-white" : "border-gray-300")}>
                    {checked && <Check size={11} />}
                  </div>
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600 flex-shrink-0">
                    {e.firstName[0]}{e.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-900 truncate">{e.firstName} {e.lastName}</div>
                    <div className="text-[10px] text-gray-500 truncate">{e.employeeCode}{e.jobTitle ? ` · ${e.jobTitle}` : ""}</div>
                  </div>
                </button>
              );
            })
          ) : (
            roles.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">No matching roles</div>
            ) : roles.map((r) => {
              const checked = picked.has(r.id);
              return (
                <button key={r.id} type="button" onClick={() => toggle(r.id)}
                  className={clsx("w-full flex items-center gap-2 px-2 py-1.5 rounded transition text-left",
                    checked ? "bg-[#f0fdf4] border border-[#bbf7d0]" : "hover:bg-gray-50 border border-transparent")}>
                  <div className={clsx("w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                    checked ? "border-[#16a34a] bg-[#16a34a] text-white" : "border-gray-300")}>
                    {checked && <Check size={11} />}
                  </div>
                  <Shield size={14} className="text-[#7c3aed] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-900 truncate">{r.name}</div>
                    <div className="text-[10px] text-gray-500 font-mono">{r.code}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button type="button" onClick={doAssign} disabled={picked.size === 0 || assignMut.isPending} className="btn btn-primary btn-sm">
            <Plus size={13} /> Assign {picked.size > 0 ? `(${picked.size})` : ""}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SubTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition",
        active ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700")}>
      {icon} {label}
    </button>
  );
}

// ── Detail-pane helpers (master-detail layout) ─────────────

function DetailTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 pb-2.5 -mb-px text-[13px] font-medium border-b-2 transition",
        active ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700",
      )}
    >
      {icon} {label}
    </button>
  );
}

function RuleRow({ label, value, unit, bool }: { label: string; value?: number | null; unit?: string; bool?: boolean }) {
  const isSet = bool !== undefined ? bool : value != null;
  const display = bool !== undefined ? (bool ? "Yes" : "No") : value != null ? `${value} ${unit ?? ""}`.trim() : "No limit";
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 px-3.5 py-2.5">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={clsx("text-[13px] font-semibold", isSet ? "text-gray-900" : "text-gray-400")}>{display}</span>
    </div>
  );
}

// Employees table with client-side search + pagination (all members are
// already loaded with the group detail).
function MembersTable({ members, onRemove }: { members: Member[]; onRemove: (m: Member) => void }) {
  const PAGE_SIZE = 10;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  if (members.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
        <Users size={24} className="mx-auto text-gray-300 mb-2" />
        <p className="text-xs text-gray-500">No employees assigned yet.</p>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? members.filter((m) => `${m.firstName} ${m.lastName} ${m.employeeCode ?? ""} ${m.jobTitle ?? ""} ${m.department?.name ?? ""}`.toLowerCase().includes(q))
    : members;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div>
      <div className="relative mb-3 max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search employees…"
          className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#166534]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-xs text-gray-500">
          No employees match &ldquo;{search}&rdquo;.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-green-50 text-left text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5">Job</th>
                <th className="px-4 py-2.5">Department</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((m, i) => (
                <tr key={m.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className={clsx("h-8 w-8 rounded-full grid place-items-center text-[11px] font-semibold", AVATAR_COLORS[(start + i) % AVATAR_COLORS.length])}>
                        {initials(m.firstName, m.lastName)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-[12.5px]">{m.firstName} {m.lastName}</p>
                        <p className="text-[11px] text-gray-400">{m.employeeCode ?? "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{m.jobTitle ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{m.department?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => onRemove(m)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                      <X size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* pager — always shown so the count is visible */}
      <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
        <span>Showing {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}</span>
        <div className="flex items-center gap-1">
          <button disabled={current <= 1} onClick={() => setPage(current - 1)} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Prev</button>
          <span className="px-2 tabular-nums">{current} / {totalPages}</span>
          <button disabled={current >= totalPages} onClick={() => setPage(current + 1)} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">Next</button>
        </div>
      </div>
    </div>
  );
}

// Rules tab — read-only rows with inline edit (Save patches the group).
type RuleForm = {
  maxPerMonth: number | null; maxConsecutiveDays: number | null;
  advanceNoticeDays: number | null; applicableAfterDays: number | null;
  blockedDuringNotice: boolean;
};
// Kept in sync with the Edit-group modal's rule fields.
const NUM_RULES = [
  { key: "maxPerMonth", label: "Max per month" },
  { key: "maxConsecutiveDays", label: "Max consecutive" },
  { key: "advanceNoticeDays", label: "Advance notice" },
  { key: "applicableAfterDays", label: "Eligible after joining" },
] as const;

function RulesPanel({ group }: { group: GroupDetail }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const pick = (g: GroupDetail): RuleForm => ({
    maxPerMonth: g.maxPerMonth, maxConsecutiveDays: g.maxConsecutiveDays,
    advanceNoticeDays: g.advanceNoticeDays, applicableAfterDays: g.applicableAfterDays,
    blockedDuringNotice: g.blockedDuringNotice,
  });
  const [form, setForm] = useState<RuleForm>(pick(group));

  const monthCap = group.yearlyQuota > 0 ? Math.min(31, group.yearlyQuota) : 31;
  const errFor = (key: keyof RuleForm): string => {
    const v = form[key];
    if (typeof v !== "number") return "";
    if (v < 0) return "Must be 0 or more.";
    if (key === "maxPerMonth") {
      if (group.yearlyQuota > 0 && v > group.yearlyQuota) return `Can't exceed the yearly quota (${group.yearlyQuota}).`;
      if (v > 31) return "A month has at most 31 days.";
    }
    if (key === "maxConsecutiveDays") {
      const cap = form.maxPerMonth ?? monthCap;
      if (v > cap) return `Can't exceed ${cap}.`;
    }
    if (key === "advanceNoticeDays" && v > 60) return "Keep it 60 or less.";
    if (key === "applicableAfterDays" && v > 365) return "Keep it 365 or less.";
    return "";
  };
  const hasErrors = NUM_RULES.some((r) => errFor(r.key) !== "");

  const saveMut = useMutation({
    mutationFn: () => api.patch(`/api/v1/hrms/wfh/quota-groups/${group.id}`, form),
    onSuccess: async () => {
      toast.success("Rules updated");
      await qc.invalidateQueries({ queryKey: ["wfh-quota-groups"] });
      await qc.invalidateQueries({ queryKey: ["wfh-quota-groups", group.id] });
      setEditing(false);
    },
    meta: { suppressGlobalError: true },
    onError: () => toast.error("Couldn't update rules"),
  });

  const inp = "w-24 text-right border border-gray-200 rounded-md px-2 py-1 text-[13px] focus:outline-none focus:ring-1 focus:ring-[#166534]";

  if (!editing) {
    return (
      <div>
        <div className="flex justify-end mb-3">
          <button onClick={() => { setForm(pick(group)); setEditing(true); }} className="btn btn-secondary">
            <Pencil size={13} /> Edit rules
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RuleRow label="Max per month" value={group.maxPerMonth} unit="days" />
          <RuleRow label="Max consecutive" value={group.maxConsecutiveDays} unit="days" />
          <RuleRow label="Advance notice" value={group.advanceNoticeDays} unit="days" />
          <RuleRow label="Eligible after joining" value={group.applicableAfterDays} unit="days" />
          <RuleRow label="Blocked during notice" bool={group.blockedDuringNotice} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {NUM_RULES.map((r) => {
          const err = errFor(r.key);
          return (
            <div key={r.key} className="rounded-xl border border-gray-200 px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-600">{r.label}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    placeholder="No limit"
                    value={form[r.key] ?? ""}
                    onChange={(e) => { const v = e.target.value; setForm({ ...form, [r.key]: v === "" ? null : Math.max(0, parseInt(v, 10) || 0) }); }}
                    className={clsx(inp, err && "!border-red-400 focus:!ring-red-300")}
                  />
                  <span className="text-[11px] text-gray-400 w-7">days</span>
                </div>
              </div>
              {err && <p className="text-[11px] text-red-600 mt-1 text-right">{err}</p>}
            </div>
          );
        })}
        <label className="rounded-xl border border-gray-200 px-3.5 py-2.5 flex items-center justify-between gap-2 cursor-pointer">
          <span className="text-xs text-gray-600">Blocked during notice</span>
          <input type="checkbox" className="accent-green-600 h-4 w-4" checked={form.blockedDuringNotice} onChange={(e) => setForm({ ...form, blockedDuringNotice: e.target.checked })} />
        </label>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">Leave a field blank for &ldquo;no limit&rdquo;.</p>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => setEditing(false)} className="btn btn-secondary btn-sm">Cancel</button>
        <button onClick={() => !hasErrors && saveMut.mutate()} disabled={hasErrors || saveMut.isPending} className="btn btn-primary btn-sm">Save rules</button>
      </div>
    </div>
  );
}

function Stat({ icon, value, label, small }: { icon: React.ReactNode; value: React.ReactNode; label: string; small?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="h-9 w-9 shrink-0 rounded-lg bg-white grid place-items-center text-green-600 shadow-sm">{icon}</div>
      <div className="min-w-0">
        <p className={clsx("font-bold text-gray-900 truncate", small ? "text-[13px]" : "text-lg")}>{value}</p>
        <p className="text-[11px] text-gray-500">{label}</p>
      </div>
    </div>
  );
}
