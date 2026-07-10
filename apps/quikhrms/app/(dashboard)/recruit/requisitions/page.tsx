"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { clsx } from "clsx";
import { Plus, Briefcase, Filter, X, AlertTriangle, Check, XCircle, Pause, Play, Pencil, Sparkles, Trash2, Target, ChevronDown,
  ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Users, Search as SearchIcon, IndianRupee, GraduationCap, Gift, Globe, Lock, UserCog, Eye } from "lucide-react";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { RequisitionWizard, toReqPayload, emptyReqForm } from "../_components/requisition-wizard";
import type { ReqFormShape, DeptOption, PipelineOption, EmpOption, SkillWeightItem } from "../_components/requisition-wizard";


interface ReqItem {
  id: string;
  requisitionNumber: string;
  title: string;
  positions: number;
  filledPositions: number;
  type: string;
  employmentType: string;
  status: string;
  priority: string;
  workLocation?: string;
  pipelineId: string | null;
  reportingToId?: string | null;
  jobDescription?: string | null;
  skillWeights?: SkillWeightItem[] | null;
  department: { id: string; name: string } | null;
  hiringManager: { id: string; firstName: string; lastName: string } | null;
  recruiter: { id: string; firstName: string; lastName: string } | null;
  rolePurpose?: string | null;
  raisedAt?: string | null;
  closedDate?: string | null;
  createdAt?: string | null;
  // 5-step wizard extras
  jobOpeningName?: string | null;
  interviewPanel?: string[] | null;
  budget?: string | number | null;
  targetJoiningDate?: string | null;
  etaToFillDays?: number | null;
  jobGrade?: string | null;
  costCenter?: string | null;
  experienceMin?: number | null;
  experienceMax?: number | null;
  salaryMin?: string | number | null;
  salaryMax?: string | number | null;
  education?: string | null;
  referralBonusAmount?: string | number | null;
  careerPageVisible?: boolean;
  internalPostingOnly?: boolean;
  postToJobPortal?: boolean;
  requirements?: string[] | null;
  niceToHave?: string[] | null;
  benefits?: string[] | null;
  responsibilities?: string[] | null;
  _count: { applications: number };
}




const statusColors: Record<string, string> = {
  ReqDraft: "bg-gray-100 text-gray-600",
  PendingApproval: "bg-amber-50 text-amber-600",
  ReqApproved: "bg-green-50 text-green-600",
  ReqOpen: "bg-green-50 text-green-600",
  ReqOnHold: "bg-orange-50 text-orange-600",
  ReqClosed: "bg-gray-100 text-gray-500",
  ReqCancelled: "bg-red-50 text-red-600",
};

const priorityColors: Record<string, string> = {
  Low: "bg-gray-100 text-gray-600", Medium: "bg-amber-50 text-amber-600", High: "bg-orange-50 text-orange-600", Urgent: "bg-red-50 text-red-600",
};

function prettyStatus(s: string): string {
  return s
    .replace(/^Req/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

type ActionVariant = "green" | "blue" | "amber" | "red" | "slate";

const actionVariants: Record<ActionVariant, string> = {
  green: "bg-green-50 text-green-600 border-green-100 hover:bg-green-100",
  blue:  "bg-green-50 text-green-600 border-green-100 hover:bg-green-100",
  amber: "bg-amber-50 text-amber-500 border-amber-100 hover:bg-amber-100",
  red:   "bg-red-50 text-red-500 border-red-100 hover:bg-red-100",
  slate: "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100",
};

// Icon-only square action button (matches the compact recruit table actions).
function ActionBtn({
  icon, title, variant, onClick,
}: { icon: React.ReactNode; title: string; variant: ActionVariant; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={clsx(
        "inline-flex items-center justify-center w-9 h-9 rounded-xl border transition",
        actionVariants[variant],
      )}
    >
      {icon}
    </button>
  );
}

export default function RequisitionsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewReq, setViewReq] = useState<ReqItem | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [cancelTarget, setCancelTarget] = useState<ReqItem | null>(null);
  const emptyForm = emptyReqForm;
  const [form, setForm] = useState<ReqFormShape>(emptyForm);

  const params = new URLSearchParams({ limit: "100", ...(statusFilter && { status: statusFilter }) });

  const { data, isLoading } = useQuery({
    queryKey: ["requisitions", statusFilter],
    queryFn: () => api.get<ReqItem[]>(`/api/v1/hrms/recruit/requisitions?${params}`),
  });

  const { data: deptsData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<DeptOption[]>("/api/v1/hrms/departments?limit=200"),
  });
  const departments = deptsData?.data ?? [];

  const { data: pipelinesData } = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api.get<PipelineOption[]>("/api/v1/hrms/recruit/pipelines"),
  });
  const pipelines = pipelinesData?.data ?? [];

  const { data: empData } = useQuery({
    queryKey: ["employees-picker"],
    queryFn: () => api.get<EmpOption[]>("/api/v1/hrms/employees?limit=500&status=Active"),
  });
  const employees = empData?.data ?? [];

  const createMut = useMutation({
    mutationFn: (body: ReqFormShape) => api.post("/api/v1/hrms/recruit/requisitions", toReqPayload(body)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["requisitions"] }); setShowCreate(false); toast.success("Requisition created"); },
  });

  const editMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReqFormShape }) =>
      api.patch(`/api/v1/hrms/recruit/requisitions/${id}`, toReqPayload(body)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["requisitions"] }); setEditId(null); setShowCreate(false); toast.success("Requisition updated"); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/v1/hrms/recruit/requisitions/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["requisitions"] }); setCancelTarget(null); },
  });

  const reqs = data?.data ?? [];

  return (
    <div className="w-full px-5 py-4">
      <h1 className="text-page-title text-gray-900 mb-5">Job requisitions</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 px-1 mr-1">
              <Filter size={15} /> Status
            </div>
            {[
              { value: "", label: "All" },
              { value: "ReqDraft", label: "Draft" },
              { value: "ReqOpen", label: "Open" },
              { value: "ReqOnHold", label: "On Hold" },
              { value: "ReqClosed", label: "Closed" },
              { value: "ReqCancelled", label: "Cancelled" },
            ].map((s) => {
              const active = statusFilter === s.value;
              return (
                <button
                  key={s.value || "all"}
                  onClick={() => setStatusFilter(s.value)}
                  className={clsx(
                    "inline-flex items-center gap-1 px-4 py-1.5 rounded-full text-[13px] font-semibold border transition",
                    active
                      ? "bg-green-100 border-green-200 text-green-700"
                      : "bg-white border-gray-200 text-gray-600 hover:border-green-500/40 hover:text-green-700",
                  )}
                >
                  {s.label}
                  {active && s.value && <X size={12} className="ml-0.5" />}
                </button>
              );
            })}
          </div>
          <button onClick={() => { setForm(emptyForm); setEditId(null); setShowCreate(true); }}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-[14px] bg-green-600 hover:bg-green-700 text-white text-xs font-medium shrink-0 transition">
            <Plus size={13} /> New requisition
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-4"><SkeletonTable rows={6} cols={5} /></div> : reqs.length === 0 ? (
          <div className="p-8 text-center text-gray-500"><Briefcase size={32} className="mx-auto mb-2 text-gray-300" />No requisitions</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Requisition</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Department</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Recruiter (HR)</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Positions</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Applications</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Priority</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Status</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r, i) => {
                const opened = r.raisedAt ?? r.createdAt;
                const ageDays = opened ? Math.max(0, Math.floor((Date.now() - new Date(opened).getTime()) / 86400000)) : null;
                const toClose = r.closedDate ? Math.ceil((new Date(r.closedDate).getTime() - Date.now()) / 86400000) : null;
                const recruiterName = r.recruiter ? `${r.recruiter.firstName} ${r.recruiter.lastName}`
                  : r.hiringManager ? `${r.hiringManager.firstName} ${r.hiringManager.lastName}` : "—";
                const isOpenish = r.status === "ReqOpen" || r.status === "ReqOnHold";
                return (
                <tr key={r.id} className="row-stagger border-b border-gray-100 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-2.5">
                    <p className="text-[13px] font-medium text-gray-900">{r.title}</p>
                    {r.rolePurpose && <p className="text-[11px] italic text-gray-400 truncate max-w-[240px]">{r.rolePurpose}</p>}
                    <p className="text-[11px] text-gray-500">{r.requisitionNumber} &middot; {r.employmentType}</p>
                    {(isOpenish || toClose != null) && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {isOpenish && ageDays != null && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 ring-1 ring-green-200">
                            {prettyStatus(r.status)} {ageDays}d
                          </span>
                        )}
                        {toClose != null && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 ring-1 ring-green-200">
                            {toClose >= 0 ? `${toClose}d to close` : `${Math.abs(toClose)}d overdue`}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{r.department?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{recruiterName}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 text-center">{r.filledPositions}/{r.positions}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 text-center">{r._count.applications}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium", priorityColors[r.priority])}>{r.priority}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium", statusColors[r.status])}>{prettyStatus(r.status)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      <ActionBtn title="View" variant="slate" icon={<Eye size={12} />} onClick={() => setViewReq(r)} />
                      {r.status !== "ReqCancelled" && r.status !== "ReqClosed" && (
                        <ActionBtn title="Edit" variant="green" icon={<Pencil size={12} />} onClick={() => {
                          setForm(reqToForm(r));
                          setEditId(r.id);
                          setShowCreate(true);
                        }} />
                      )}
                      {r.status === "ReqDraft" && (
                        <ActionBtn title="Open" variant="green" icon={<Check size={12} />}
                          onClick={() => updateMut.mutate({ id: r.id, status: "ReqOpen" })} />
                      )}
                      {r.status === "ReqOpen" && (
                        <ActionBtn title="Close" variant="slate" icon={<XCircle size={12} />}
                          onClick={() => updateMut.mutate({ id: r.id, status: "ReqClosed" })} />
                      )}
                      {(r.status === "ReqOpen" || r.status === "ReqApproved" || r.status === "ReqDraft") && (
                        <ActionBtn title="On Hold" variant="amber" icon={<Pause size={12} />}
                          onClick={() => updateMut.mutate({ id: r.id, status: "ReqOnHold" })} />
                      )}
                      {r.status === "ReqOnHold" && (
                        <ActionBtn title="Resume" variant="blue" icon={<Play size={12} />}
                          onClick={() => updateMut.mutate({ id: r.id, status: "ReqOpen" })} />
                      )}
                      {r.status !== "ReqCancelled" && r.status !== "ReqClosed" && (
                        <ActionBtn title="Cancel" variant="red" icon={<Trash2 size={12} />}
                          onClick={() => setCancelTarget(r)} />
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && reqs.length > 0 && (
        <div className="flex items-center justify-end gap-4 mt-4">
          <span className="text-xs text-gray-500">Showing 1 to {reqs.length} of {reqs.length} result{reqs.length === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled aria-label="Previous page"
              className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 disabled:opacity-50">
              <ChevronLeft size={12} />
            </button>
            <button type="button" aria-current="page"
              className="w-9 h-9 rounded-lg bg-green-600 text-white flex items-center justify-center text-xs font-semibold">
              1
            </button>
            <button type="button" disabled aria-label="Next page"
              className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 disabled:opacity-50">
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setEditId(null); }}
        title={editId ? "Edit Job Requisition" : "New Job Requisition"} size="3xl">
        <RequisitionWizard
          form={form}
          setForm={setForm}
          isEdit={!!editId}
          departments={departments}
          pipelines={pipelines}
          employees={employees}
          submitting={createMut.isPending || editMut.isPending}
          onCancel={() => { setShowCreate(false); setEditId(null); }}
          onSubmit={() => { editId ? editMut.mutate({ id: editId, body: form }) : createMut.mutate(form); }}
        />
      </Modal>

      {viewReq && (() => {
        const rcv = viewReq.recruiter ? `${viewReq.recruiter.firstName} ${viewReq.recruiter.lastName}`.trim() : "—";
        const hm = viewReq.hiringManager ? `${viewReq.hiringManager.firstName} ${viewReq.hiringManager.lastName}`.trim() : "—";
        const STATUS_LABEL: Record<string, string> = {
          ReqDraft: "Draft", PendingApproval: "Pending Approval", ReqApproved: "Approved",
          ReqOpen: "Open", ReqOnHold: "On Hold", ReqClosed: "Closed", ReqCancelled: "Cancelled",
        };
        const rng = (a: string | number | null | undefined, b: string | number | null | undefined, suffix: string) =>
          a != null || b != null ? `${a ?? "?"} – ${b ?? "?"} ${suffix}` : "—";
        const fmtDate = (d?: string | null) =>
          d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
        const fields: Array<[string, string]> = [
          ["Department", viewReq.department?.name ?? "—"],
          ["Recruiter (HR)", rcv],
          ["Hiring Manager", hm],
          ["Employment Type", viewReq.employmentType ?? "—"],
          ["Work Location", viewReq.workLocation ?? "—"],
          ["Positions", `${viewReq.filledPositions}/${viewReq.positions}`],
          ["Applications", String(viewReq._count.applications)],
          ["Priority", viewReq.priority ?? "—"],
          ["Status", STATUS_LABEL[viewReq.status] ?? viewReq.status],
          ["Experience", rng(viewReq.experienceMin, viewReq.experienceMax, "yrs")],
          ["Salary", rng(viewReq.salaryMin, viewReq.salaryMax, "LPA")],
          ["Target Joining", fmtDate(viewReq.targetJoiningDate)],
        ];
        const lists: Array<[string, string[] | null | undefined]> = [
          ["Requirements", viewReq.requirements],
          ["Nice to Have", viewReq.niceToHave],
          ["Responsibilities", viewReq.responsibilities],
          ["Benefits", viewReq.benefits],
        ];
        return (
          <Modal open onClose={() => setViewReq(null)} size="2xl"
            title={viewReq.title} subtitle={`${viewReq.requisitionNumber} · ${viewReq.type}`}>
            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                {fields.map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
                    <p className="text-gray-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              {viewReq.jobDescription && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Job Description</p>
                  <p className="text-gray-700 whitespace-pre-line leading-relaxed">{viewReq.jobDescription}</p>
                </div>
              )}
              {lists.map(([label, items]) =>
                items && items.length > 0 ? (
                  <div key={label}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
                    <ul className="list-disc pl-5 space-y-0.5 text-gray-700">
                      {items.map((it, i) => <li key={i}>{it}</li>)}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          </Modal>
        );
      })()}

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !updateMut.isPending && setCancelTarget(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4">
              <div className="flex items-start gap-4">
                <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-red-50 ring-4 ring-red-50/60">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[13px] font-semibold text-slate-900">Cancel Requisition</h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                    Are you sure you want to cancel{" "}
                    <span className="font-semibold text-slate-700">&quot;{cancelTarget.title}&quot;</span>{" "}
                    <span className="text-slate-400">({cancelTarget.requisitionNumber})</span>?
                  </p>
                  <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5">
                    This will stop all hiring activity. Candidates already applied will be notified. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                disabled={updateMut.isPending}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              >
                Keep Open
              </button>
              <button
                type="button"
                onClick={() => updateMut.mutate({ id: cancelTarget.id, status: "ReqCancelled" })}
                disabled={updateMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-600 to-green-600 hover:from-red-700 hover:to-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50 transition"
              >
                {updateMut.isPending ? "Cancelling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Role Scorecard section (collapsible) ────────────────────────────────
   Optional fields modeled on the JD-Scorecard pattern:
   - Role Purpose: 1-2 sentences ("why this role exists")
   - Key Responsibilities
*/

function reqNum(v: string | number | null | undefined): number | null {
  return v === null || v === undefined || v === "" ? null : Number(v);
}

function reqToForm(r: ReqItem): ReqFormShape {
  return {
    title: r.title ?? "",
    jobOpeningName: r.jobOpeningName ?? "",
    departmentId: r.department?.id ?? "",
    pipelineId: r.pipelineId ?? "",
    positions: r.positions ?? 1,
    type: r.type ?? "NewPosition",
    priority: r.priority ?? "Medium",
    employmentType: r.employmentType ?? "FullTime",
    workLocation: r.workLocation ?? "Office",
    interviewPanelIds: Array.isArray(r.interviewPanel) ? r.interviewPanel : [],
    reportingToId: r.reportingToId ?? "",
    hiringManagerId: r.hiringManager?.id ?? "",
    recruiterId: r.recruiter?.id ?? "",
    experienceMin: reqNum(r.experienceMin),
    experienceMax: reqNum(r.experienceMax),
    salaryMin: reqNum(r.salaryMin),
    salaryMax: reqNum(r.salaryMax),
    budget: reqNum(r.budget),
    targetJoiningDate: r.targetJoiningDate ? r.targetJoiningDate.slice(0, 10) : "",
    closedDate: r.closedDate ? r.closedDate.slice(0, 10) : "",
    etaToFillDays: reqNum(r.etaToFillDays),
    jobGrade: r.jobGrade ?? "",
    costCenter: r.costCenter ?? "",
    jobDescription: r.jobDescription ?? "",
    requirements: Array.isArray(r.requirements) ? r.requirements : [],
    niceToHave: Array.isArray(r.niceToHave) ? r.niceToHave : [],
    benefits: Array.isArray(r.benefits) ? r.benefits : [],
    education: r.education ?? "",
    referralBonusAmount: reqNum(r.referralBonusAmount),
    careerPageVisible: r.careerPageVisible ?? true,
    internalPostingOnly: r.internalPostingOnly ?? false,
    postToJobPortal: r.postToJobPortal ?? false,
    rolePurpose: r.rolePurpose ?? "",
    responsibilities: Array.isArray(r.responsibilities) ? r.responsibilities : [],
    skillWeights: Array.isArray(r.skillWeights) ? r.skillWeights : [],
    justification: "",
  };
}
