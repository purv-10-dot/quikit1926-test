"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { PageBackground } from "@/components/hrms/page-background";
import {
  ShieldCheck, ArrowLeft, Eye, Plus, Pencil, Trash2, Calendar, Clock,
  Search, Filter, Users, CheckCircle2, X, Building2,
} from "lucide-react";
import { useToast } from "@/components/hrms/toast";
import { clsx } from "clsx";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { DocumentSourcePicker } from "@/components/hrms/document-source-picker";
import { Select } from "@/components/hrms/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { SkeletonLine, SkeletonTable } from "@/components/hrms/skeleton";
import { todayInput } from "@/lib/utils/date-input";
import { withBasePath } from "@/lib/utils/base-path";

/** Prepend basePath for internally-proxied uploads; leave external links as-is. */
function docHref(url: string): string {
  return url.startsWith("/") ? withBasePath(url) : url;
}

const statusColors: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  Draft: "bg-blue-100 text-blue-700",
  Expired: "bg-red-100 text-red-700",
  Archived: "bg-gray-100 text-gray-600",
};

interface DocDetail {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  status: string;
  expiryDate: string | null;
  createdAt: string;
  metadata: { notifyDaysBefore?: number; startDate?: string; vendorName?: string; notifyEmployeeIds?: string[] } | null;
}

interface Member {
  id: string;
  employeeId: string;
  createdAt: string;
  employee: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    employeeCode: string | null;
    department: { name: string } | null;
    designation: { title: string } | null;
  } | null;
}

export default function InsurancePolicyDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const api = useApiClient();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [selectAll, setSelectAll] = useState(false);
  const [removeMember, setRemoveMember] = useState<Member | null>(null);
  const [search, setSearch] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [department, setDepartment] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "", description: "", fileUrl: "", fileType: "application/pdf", fileSize: 0,
    startDate: "", expiryDate: "", notifyDaysBefore: 30, vendorName: "",
    notifyEmployeeIds: [] as string[],
  });

  const { data, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => api.get<DocDetail>(`/api/v1/hrms/documents/${id}`),
  });

  // Active employees, for the "Notify (multiple)" recipient picker + chip labels.
  const { data: empData } = useQuery({
    queryKey: ["employees-active-list"],
    queryFn: () => api.get<{ id: string; firstName: string; lastName: string }[]>("/api/v1/hrms/employees?status=Active&limit=200"),
    staleTime: 5 * 60_000,
  });
  const employees = empData?.data ?? [];

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["documents", "insurance", id, "members"],
    queryFn: () => api.get<Member[]>(`/api/v1/hrms/documents/${id}/insurance-members`),
  });

  const members = membersData?.data ?? [];

  const departments = useMemo(
    () => [...new Set(members.map((m) => m.employee?.department?.name).filter(Boolean) as string[])].sort(),
    [members],
  );

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (department && m.employee?.department?.name !== department) return false;
      if (!q) return true;
      const name = `${m.employee?.firstName ?? ""} ${m.employee?.lastName ?? ""}`.toLowerCase();
      return name.includes(q) || (m.employee?.employeeCode ?? "").toLowerCase().includes(q);
    });
  }, [members, search, department]);

  const addMut = useMutation({
    mutationFn: (body: { employeeId: string } | { allEmployees: true }) =>
      api.post<{ count: number } | Member>(`/api/v1/hrms/documents/${id}/insurance-members`, body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["documents", "insurance", id, "members"] });
      const count = res.data && "count" in res.data ? res.data.count : 1;
      toast.success(count === 1 ? "Employee added" : `${count} employee${count === 1 ? "" : "s"} added`);
      setShowAdd(false);
      setEmployeeId("");
      setSelectAll(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Could not add employee(s)";
      toast.error(message);
    },
  });

  const removeMut = useMutation({
    mutationFn: (memberId: string) => api.delete(`/api/v1/hrms/documents/${id}/insurance-members/${memberId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", "insurance", id, "members"] });
      toast.success("Employee removed");
      setRemoveMember(null);
    },
  });

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put(`/api/v1/hrms/documents/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Policy updated");
      setShowEdit(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/hrms/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Policy deleted");
      router.push("/documents/insurance");
    },
  });

  if (isLoading) return (
    <div className="p-8 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="80%" h={12} />
      <SkeletonLine w="60%" h={12} />
    </div>
  );
  const d = data?.data;
  if (!d) return <div className="p-8 text-center text-gray-500">Insurance policy not found</div>;

  const openEdit = () => {
    setEditForm({
      title: d.title,
      description: d.description ?? "",
      fileUrl: d.fileUrl,
      fileType: d.fileType,
      fileSize: d.fileSize,
      startDate: d.metadata?.startDate ? d.metadata.startDate.slice(0, 10) : "",
      expiryDate: d.expiryDate ? d.expiryDate.slice(0, 10) : "",
      notifyDaysBefore: d.metadata?.notifyDaysBefore ?? 30,
      vendorName: d.metadata?.vendorName ?? "",
      notifyEmployeeIds: d.metadata?.notifyEmployeeIds ?? [],
    });
    setShowEdit(true);
  };

  const daysLeft = d.expiryDate ? Math.ceil((new Date(d.expiryDate).getTime() - Date.now()) / 86_400_000) : null;
  const notifyDaysBefore = d.metadata?.notifyDaysBefore;
  const expiringSoon = daysLeft !== null && daysLeft >= 0 && notifyDaysBefore != null && daysLeft <= notifyDaysBefore ? members.length : 0;
  const isFiltering = search.trim() !== "" || department !== "";

  return (
    <div className="w-full px-5 py-4">
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 mb-4 text-[11px] font-semibold text-accent-700 bg-accent-100 hover:bg-accent-600 hover:text-white rounded-full transition-colors"
      >
        <ArrowLeft size={14} /> Back to Insurance Plans
      </button>

      {/* ── Policy header card ── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent-100 text-accent-700 flex items-center justify-center shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-page-title text-gray-900">{d.title}</h1>
                <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[d.status] ?? statusColors.Archived)}>
                  {d.status}
                </span>
              </div>
              {d.description && <p className="text-sm text-gray-500 mt-1">{d.description}</p>}
              <div className="flex items-center gap-2 flex-wrap mt-2 text-xs text-gray-500">
                {d.metadata?.vendorName && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 size={12} /> {d.metadata.vendorName}
                  </span>
                )}
                {d.metadata?.vendorName && (d.metadata?.startDate || d.expiryDate) && <span className="text-gray-300">|</span>}
                {d.metadata?.startDate && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} /> Starts {new Date(d.metadata.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                )}
                {d.metadata?.startDate && d.expiryDate && <span className="text-gray-300">|</span>}
                {d.expiryDate && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} /> Expires on {new Date(d.expiryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                )}
                {notifyDaysBefore != null && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <Clock size={12} /> Notifies {notifyDaysBefore} days before expiry
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {d.fileUrl && (
              <a href={docHref(d.fileUrl)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700">
                <Eye size={14} /> View Details
              </a>
            )}
            <button onClick={openEdit} className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50">
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => setShowDelete(true)} className="inline-flex items-center gap-1.5 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-50">
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* ── Assigned employees ── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">Assigned Employees</h2>
              <span className="px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 text-xs font-semibold">{members.length}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Manage employees assigned to this insurance.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { setEmployeeId(""); setSelectAll(false); setShowAdd(true); }} className="btn btn-primary btn-sm">
              <Plus size={13} /> Add Employee
            </button>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee..."
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
            </div>
            <button
              onClick={() => setShowFilter((s) => !s)}
              title="Filter by department"
              className={clsx(
                "p-1.5 rounded-lg border transition-colors",
                showFilter || department ? "border-accent-400 bg-accent-50 text-accent-700" : "border-gray-200 text-gray-500 hover:bg-gray-50",
              )}
            >
              <Filter size={14} />
            </button>
          </div>
        </div>

        {showFilter && (
          <div className="flex items-center gap-2 mb-4 -mt-2">
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
            >
              <option value="">All departments</option>
              {departments.map((dep) => <option key={dep} value={dep}>{dep}</option>)}
            </select>
            {department && (
              <button onClick={() => setDepartment("")} className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
                <X size={12} /> Clear
              </button>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 border border-gray-100 rounded-lg mb-4">
          <StatTile icon={<Users size={16} />} iconClass="bg-accent-100 text-accent-700" label="Total Assigned" value={String(members.length)} />
          <StatTile icon={<CheckCircle2 size={16} />} iconClass="bg-green-100 text-green-700" label="Active Assignments" value={String(members.length)} />
          <StatTile icon={<Clock size={16} />} iconClass="bg-amber-100 text-amber-700" label="Expiring Soon" value={String(expiringSoon)} />
        </div>

        {/* Table */}
        {membersLoading ? (
          <SkeletonTable rows={5} cols={8} />
        ) : filteredMembers.length === 0 ? (
          <EmptyMembers isFiltering={isFiltering} onAdd={() => setShowAdd(true)} onClearFilters={() => { setSearch(""); setDepartment(""); }} />
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-accent-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5 font-semibold">Employee</th>
                  <th className="px-4 py-2.5 font-semibold">Employee ID</th>
                  <th className="px-4 py-2.5 font-semibold">Department</th>
                  <th className="px-4 py-2.5 font-semibold">Designation</th>
                  <th className="px-4 py-2.5 font-semibold">Assigned On</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {`${m.employee?.firstName ?? ""} ${m.employee?.lastName ?? ""}`.trim() || m.employeeId}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{m.employee?.employeeCode ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{m.employee?.department?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{m.employee?.designation?.title ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{new Date(m.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Active</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setRemoveMember(m)} title="Remove" className="text-red-500 hover:bg-red-50 p-1.5 rounded">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Employee to Policy">
        {/* min-h ensures the panel is tall enough to contain the EmployeeSelect's
            open dropdown — it's absolutely positioned, so it doesn't grow the
            panel's own auto-sized height, and would otherwise get clipped by
            the modal's overflow-hidden with content this short. */}
        <div className="space-y-4 min-h-[420px]">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={selectAll} onChange={(e) => { setSelectAll(e.target.checked); setEmployeeId(""); }}
              className="rounded border-gray-300 text-accent-600 focus:ring-accent-400" />
            Select all employees
          </label>
          {selectAll ? (
            <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              Every employee not already enrolled in this policy will be added.
            </p>
          ) : (
            <EmployeeSelect
              label="Employee"
              value={employeeId}
              onChange={setEmployeeId}
              excludeIds={members.map((m) => m.employeeId)}
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button
              type="button"
              disabled={(!selectAll && !employeeId) || addMut.isPending}
              onClick={() => addMut.mutate(selectAll ? { allEmployees: true } : { employeeId })}
              className="px-4 py-2 bg-accent-600 text-white rounded-lg text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
            >
              {addMut.isPending ? "Adding…" : selectAll ? "Add All" : "Add"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!removeMember} onClose={() => setRemoveMember(null)} title="Remove Employee">
        {removeMember && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Remove <strong>{`${removeMember.employee?.firstName ?? ""} ${removeMember.employee?.lastName ?? ""}`.trim() || removeMember.employeeId}</strong> from this policy?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setRemoveMember(null)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
              <button type="button" onClick={() => removeMut.mutate(removeMember.id)} disabled={removeMut.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {removeMut.isPending ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={`Edit: ${d.title}`} size="lg">
        <form onSubmit={(e) => {
          e.preventDefault();
          updateMut.mutate({
            title: editForm.title,
            description: editForm.description || undefined,
            fileUrl: editForm.fileUrl,
            fileType: editForm.fileType,
            fileSize: editForm.fileSize,
            expiryDate: editForm.expiryDate || undefined,
            metadata: {
              notifyDaysBefore: editForm.notifyDaysBefore,
              startDate: editForm.startDate || undefined,
              vendorName: editForm.vendorName || undefined,
              notifyEmployeeIds: editForm.notifyEmployeeIds.length ? editForm.notifyEmployeeIds : undefined,
            },
          });
        }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Policy Name</label>
              <input required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
              <input value={editForm.vendorName} onChange={(e) => setEditForm({ ...editForm, vendorName: e.target.value })}
                placeholder="e.g. HDFC ERGO"
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Policy Document <span className="text-red-500">*</span></label>
            <DocumentSourcePicker
              value={{ fileUrl: editForm.fileUrl, fileType: editForm.fileType, fileSize: editForm.fileSize }}
              onChange={(meta) => setEditForm({ ...editForm, ...meta })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date <span className="text-red-500">*</span></label>
              <input required type="date" min={todayInput()} value={editForm.expiryDate} onChange={(e) => setEditForm({ ...editForm, expiryDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Notify Before (days)</label>
              <NumberInput allowDecimal={false} value={editForm.notifyDaysBefore} onChange={(v) => setEditForm({ ...editForm, notifyDaysBefore: v ?? 30 })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notify (in addition to the policy owner)</label>
            <Select
              value=""
              onChange={(v) => { if (v && !editForm.notifyEmployeeIds.includes(v)) setEditForm({ ...editForm, notifyEmployeeIds: [...editForm.notifyEmployeeIds, v] }); }}
              options={[{ value: "", label: "Add a person to notify…" },
                ...employees
                  .filter((e) => !editForm.notifyEmployeeIds.includes(e.id))
                  .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`.trim() })),
              ]}
            />
            {editForm.notifyEmployeeIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {editForm.notifyEmployeeIds.map((eid) => {
                  const emp = employees.find((e) => e.id === eid);
                  const name = emp ? `${emp.firstName} ${emp.lastName}`.trim() : eid;
                  return (
                    <span key={eid} className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 text-xs font-medium pl-2.5 pr-1 py-1 ring-1 ring-green-200">
                      {name}
                      <button type="button" onClick={() => setEditForm({ ...editForm, notifyEmployeeIds: editForm.notifyEmployeeIds.filter((x) => x !== eid) })}
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-green-500 hover:bg-green-100">
                        <X size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowEdit(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={updateMut.isPending} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {updateMut.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Delete Insurance Policy">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Delete <strong>{d.title}</strong>? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowDelete(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="button" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatTile({ icon, iconClass, label, value }: { icon: React.ReactNode; iconClass: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3">
      <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", iconClass)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500 truncate">{label}</p>
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function EmptyMembers({ isFiltering, onAdd, onClearFilters }: { isFiltering: boolean; onAdd: () => void; onClearFilters: () => void }) {
  return (
    <div className="border border-dashed border-gray-200 rounded-lg py-12 text-center">
      <div className="w-14 h-14 rounded-full bg-accent-50 text-accent-400 flex items-center justify-center mx-auto mb-3">
        <Users size={24} />
      </div>
      {isFiltering ? (
        <>
          <h3 className="font-semibold text-gray-900">No employees match your search</h3>
          <p className="text-sm text-gray-500 mt-1">Try a different name, code, or department filter.</p>
          <button onClick={onClearFilters} className="mt-4 inline-flex items-center gap-1.5 border border-accent-300 text-accent-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-50">
            Clear filters
          </button>
        </>
      ) : (
        <>
          <h3 className="font-semibold text-gray-900">No employees assigned yet</h3>
          <p className="text-sm text-gray-500 mt-1">Add employees to assign them to this insurance plan.</p>
          <button onClick={onAdd} className="mt-4 inline-flex items-center gap-1.5 border border-accent-300 text-accent-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-50">
            <Plus size={13} /> Add Your First Employee
          </button>
        </>
      )}
    </div>
  );
}
