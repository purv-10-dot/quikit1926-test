"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { Modal } from "@/components/hrms/modal";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Plus, Pencil, Trash2, Users, X, Home } from "lucide-react";
import { clsx } from "clsx";
import { WfhTabs } from "../../wfh/_components/wfh-tabs";
import { PageHeader } from "@/components/hrms/ui/page-header";

type GroupMode = "Department" | "Employee";

interface Group {
  id: string;
  name: string;
  description: string | null;
  yearlyQuota: number;
  mode: GroupMode;
  isActive: boolean;
  _count: { members: number };
}

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
  const [staged, setStaged] = useState<Array<{ id: string; firstName: string; lastName: string; employeeCode: string | null }>>([]);
  const [deptToAdd, setDeptToAdd] = useState("");

  const [form, setForm] = useState<{ name: string; description: string; yearlyQuota: number; mode: GroupMode; isActive: boolean }>({ name: "", description: "", yearlyQuota: 60, mode: "Department", isActive: true });

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

  const resetForm = () => setForm({ name: "", description: "", yearlyQuota: 60, mode: "Department", isActive: true });

  const refreshAll = async () => {
    await qc.invalidateQueries({ queryKey: ["wfh-quota-groups"] });
  };

  const createMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/wfh/quota-groups", form),
    onSuccess: async () => { toast.success("Group created"); await refreshAll(); setShowCreate(false); resetForm(); },
    onError: (e: Error) => toast.error("Create failed", e.message),
  });

  const updateMut = useMutation({
    mutationFn: () => api.patch(`/api/v1/hrms/wfh/quota-groups/${editing?.id}`, form),
    onSuccess: async () => { toast.success("Group updated"); await refreshAll(); setEditing(null); resetForm(); },
    onError: (e: Error) => toast.error("Update failed", e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/wfh/quota-groups/${id}`),
    onSuccess: async () => { toast.success("Group deleted"); await refreshAll(); if (activeGroupId) setActiveGroupId(null); },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });

  const addMemberMut = useMutation({
    mutationFn: (empIds: string[]) => api.post(`/api/v1/hrms/wfh/quota-groups/${activeGroupId}/members`, { employeeIds: empIds }),
    onSuccess: async (_res, vars) => {
      toast.success(`${vars.length} employee${vars.length > 1 ? "s" : ""} assigned`);
      await qc.invalidateQueries({ queryKey: ["wfh-quota-groups"] });
      setStaged([]);
    },
    onError: (e: Error) => toast.error("Assign failed", e.message),
  });

  const removeMemberMut = useMutation({
    mutationFn: (empId: string) => api.delete(`/api/v1/hrms/wfh/quota-groups/${activeGroupId}/members?employeeId=${empId}`),
    onSuccess: async () => {
      toast.success("Removed");
      await qc.invalidateQueries({ queryKey: ["wfh-quota-groups"] });
    },
    onError: (e: Error) => toast.error("Remove failed", e.message),
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
    onError: (e: Error) => toast.error("Assign failed", e.message),
  });

  const removeDeptMut = useMutation({
    mutationFn: (departmentId: string) => api.delete(`/api/v1/hrms/wfh/quota-groups/${activeGroupId}/departments?departmentId=${departmentId}`),
    onSuccess: async () => {
      toast.success("Department removed");
      await qc.invalidateQueries({ queryKey: ["wfh-quota-groups"] });
    },
    onError: (e: Error) => toast.error("Remove failed", e.message),
  });

  const startEdit = (g: Group) => {
    setEditing(g);
    setForm({ name: g.name, description: g.description ?? "", yearlyQuota: g.yearlyQuota, mode: g.mode, isActive: g.isActive });
  };

  const inputCls = "w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]";

  return (
    <div className="w-full px-6 py-6">
      <PageHeader
        icon={<Home size={28} className="text-[#3b82f6]" />}
        title="WFH quota groups"
        subtitle="Define yearly day limits and assign employees."
        actions={
          <button onClick={() => { resetForm(); setShowCreate(true); }} className="btn btn-primary">
            <Plus size={14} /> New group
          </button>
        }
      />
      <div className="mb-5"><WfhTabs /></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1 space-y-2">
          {isLoading ? (
            <div className="text-sm text-gray-500 py-8 text-center">Loading...</div>
          ) : groups.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
              No groups yet. Create one to start.
            </div>
          ) : (
            groups.map((g, i) => (
              <div
                key={g.id}
                onClick={() => setActiveGroupId(g.id)}
                className={clsx(
                  "row-stagger bg-white border rounded-lg p-3 cursor-pointer transition",
                  activeGroupId === g.id ? "border-[#16243A] shadow-sm" : "border-gray-200 hover:border-gray-300",
                )}
                style={{ ["--i" as never]: Math.min(i, 10) }}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{g.name}</h3>
                      <span className={clsx(
                        "text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide",
                        g.mode === "Department" ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700",
                      )}>
                        {g.mode === "Department" ? "Dept" : "Emp"}
                      </span>
                      {!g.isActive && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">Inactive</span>}
                    </div>
                    {g.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{g.description}</p>}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-600">
                      <span><strong className="text-gray-900">{g.yearlyQuota}</strong> days/year</span>
                      {g.mode === "Employee" && (
                        <span className="inline-flex items-center gap-1"><Users size={11} /> {g._count.members}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(g); }}
                      className="p-1.5 text-gray-400 hover:text-[#16243A] hover:bg-blue-50 rounded"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await confirm({
                          title: `Delete group "${g.name}"?`,
                          description: "All members will be unassigned. This cannot be undone.",
                          variant: "danger",
                          confirmLabel: "Delete",
                        });
                        if (ok) deleteMut.mutate(g.id);
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {!activeGroupId ? (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-sm text-gray-500">
              Select a group to view and manage members.
            </div>
          ) : !detail ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">Loading...</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-gray-900">{detail.name}</h2>
                    <span className={clsx(
                      "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide",
                      detail.mode === "Department" ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700",
                    )}>
                      {detail.mode === "Department" ? "Dept-wise" : "Employee-wise"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {detail.yearlyQuota} days/year · {detail.mode === "Department" ? `${detail.departments.length} dept${detail.departments.length === 1 ? "" : "s"}` : `${detail.members.length} employee${detail.members.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>

              {/* Departments section */}
              {detail.mode === "Department" && (
              <div className="p-4 border-b border-gray-100 bg-indigo-50/30 space-y-2">
                <label className="block text-[11px] font-semibold text-indigo-700 uppercase tracking-wide">Departments (bulk)</label>
                <div className="flex items-center gap-2">
                  <select
                    value={deptToAdd}
                    onChange={(e) => setDeptToAdd(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#16243A]"
                  >
                    <option value="">Select department...</option>
                    {allDepts
                      .filter((d) => !detail.departments.some((dl) => dl.department.id === d.id))
                      .map((d) => (
                        <option key={d.id} value={d.id}>{d.name}{d.code ? ` (${d.code})` : ""}</option>
                      ))}
                  </select>
                  <button
                    onClick={() => deptToAdd && addDeptMut.mutate(deptToAdd)}
                    disabled={!deptToAdd || addDeptMut.isPending}
                    className="btn btn-primary btn-sm h-[42px] whitespace-nowrap"
                  >
                    <Plus size={13} /> Add dept
                  </button>
                </div>
                {detail.departments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {detail.departments.map((dl) => (
                      <span key={dl.id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-indigo-200 rounded-md text-xs">
                        <span className="font-semibold text-indigo-900">{dl.department.name}</span>
                        <span className="text-indigo-500">· {dl.department._count.employees} emp</span>
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Remove "${dl.department.name}"?`,
                              description: "Employees in this department will lose this group's quota (unless explicitly assigned).",
                              variant: "warning",
                              confirmLabel: "Remove",
                            });
                            if (ok) removeDeptMut.mutate(dl.department.id);
                          }}
                          className="text-gray-400 hover:text-red-600"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              )}

              {detail.mode === "Employee" && (
              <div className="p-4 border-b border-gray-100 bg-gray-50/40 space-y-2">
                <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Employees in this group</label>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-[240px]">
                    <EmployeeSelect
                      value={""}
                      onChange={() => {}}
                      onPick={(e) => {
                        setStaged((prev) =>
                          prev.some((p) => p.id === e.id) ? prev : [...prev, { id: e.id, firstName: e.firstName, lastName: e.lastName, employeeCode: e.employeeCode }],
                        );
                      }}
                      placeholder="Search employee..."
                      excludeIds={[...detail.members.map((m) => m.id), ...staged.map((s) => s.id)]}
                      clearable={false}
                    />
                  </div>
                  <button
                    onClick={() => staged.length > 0 && addMemberMut.mutate(staged.map((s) => s.id))}
                    disabled={staged.length === 0 || addMemberMut.isPending}
                    className="btn btn-primary btn-sm h-[42px] whitespace-nowrap"
                  >
                    <Plus size={13} /> Add {staged.length > 0 ? `(${staged.length})` : ""}
                  </button>
                </div>
                {staged.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {staged.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded-md text-xs">
                        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-white text-[9px] font-bold flex items-center justify-center">
                          {s.firstName[0]}{s.lastName[0]}
                        </span>
                        <span className="text-gray-800">{s.firstName} {s.lastName}</span>
                        <button onClick={() => setStaged((prev) => prev.filter((p) => p.id !== s.id))} className="text-gray-400 hover:text-red-600">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              )}

              {detail.mode === "Employee" && (detail.members.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">No members yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-4 py-2.5">Employee</th>
                      <th className="text-left px-4 py-2.5">Job</th>
                      <th className="text-left px-4 py-2.5">Department</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {detail.members.map((m) => (
                      <tr key={m.id} className="border-t border-gray-100">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-900">{m.firstName} {m.lastName}</div>
                          <div className="text-xs text-gray-500">{m.employeeCode ?? "—"}</div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{m.jobTitle ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-700">{m.department?.name ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={async () => {
                              const ok = await confirm({
                                title: `Remove ${m.firstName} ${m.lastName}?`,
                                description: "They will no longer belong to this WFH quota group.",
                                variant: "warning",
                                confirmLabel: "Remove",
                              });
                              if (ok) removeMemberMut.mutate(m.id);
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={showCreate || !!editing} onClose={() => { setShowCreate(false); setEditing(null); resetForm(); }} title={editing ? "Edit group" : "New WFH quota group"}>
        <form
          onSubmit={(e) => { e.preventDefault(); editing ? updateMut.mutate() : createMut.mutate(); }}
          className="space-y-3"
        >
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
          <Field label="Assignment type *">
            <div className="grid grid-cols-2 gap-2">
              {(["Department", "Employee"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm({ ...form, mode: m })}
                  className={clsx(
                    "px-3 py-2.5 rounded-lg border text-sm font-semibold text-left transition",
                    form.mode === m
                      ? "border-[#16243A] bg-[#16243A] text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                  )}
                >
                  <div className="text-sm">{m === "Department" ? "Whole department(s)" : "Specific employees"}</div>
                  <div className={clsx("text-[11px] font-normal mt-0.5", form.mode === m ? "text-white/70" : "text-gray-500")}>
                    {m === "Department" ? "All employees in chosen depts" : "Custom list, overrides dept rule"}
                  </div>
                </button>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowCreate(false); setEditing(null); resetForm(); }} className="btn btn-secondary btn-sm">Cancel</button>
            <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="btn btn-primary btn-sm">
              {editing ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>

    </div>
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
