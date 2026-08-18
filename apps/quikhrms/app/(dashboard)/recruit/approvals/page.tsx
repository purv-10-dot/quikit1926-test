"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { Inbox, CheckCircle2, X as XIcon, Briefcase, AlertTriangle, FileText, Pencil } from "lucide-react";
import { clsx } from "clsx";
import { RequisitionWizard, toReqPayload, emptyReqForm } from "../_components/requisition-wizard";
import type { ReqFormShape, DeptOption, PipelineOption, EmpOption, JobLevelOption } from "../_components/requisition-wizard";
import { PageBackground } from "@/components/hrms/page-background";
import { Pagination } from "@/components/hrms/pagination";

interface FullReq {
  id: string; title?: string; jobOpeningName?: string | null; pipelineId?: string | null;
  department?: { id: string } | null; departmentId?: string | null; positions?: number;
  type?: string; priority?: string; employmentType?: string; workLocation?: string;
  interviewPanel?: string[] | null; reportingToId?: string | null;
  hiringManager?: { id: string } | null; hiringManagerId?: string | null;
  recruiter?: { id: string } | null; recruiterId?: string | null;
  experienceMin?: number | null; experienceMax?: number | null;
  salaryMin?: string | number | null; salaryMax?: string | number | null; budget?: string | number | null;
  targetJoiningDate?: string | null; closedDate?: string | null; etaToFillDays?: number | null;
  jobGrade?: string | null; costCenter?: string | null; jobDescription?: string | null;
  requirements?: string[] | null; niceToHave?: string[] | null; benefits?: string[] | null;
  education?: string | null; passingYear?: number | null; technicalQuestions?: string[] | null; referralBonusAmount?: string | number | null;
  careerPageVisible?: boolean; internalPostingOnly?: boolean; postToJobPortal?: boolean;
  rolePurpose?: string | null; responsibilities?: string[] | null;
  skillWeights?: { skill: string; weight: number }[] | null; justification?: string | null;
}

interface ApprovalRow { id: string; level: number; role: string; status: string }
interface RaiserLite { id: string; firstName: string; lastName: string; workEmail: string | null; jobTitle: string | null }
interface PendingItem {
  approvalId: string;
  level: number;
  role: "DeptHead" | "HR";
  openDeptHeadcount: number;
  requisition: {
    id: string;
    requisitionNumber: string;
    title: string;
    positions: number;
    type: string;
    employmentType: string;
    workLocation: string;
    priority: string;
    justification: string | null;
    jobDescription: string | null;
    experienceMin: number | null;
    experienceMax: number | null;
    salaryMin: string | null;
    salaryMax: string | null;
    department: { id: string; name: string } | null;
    raiser: RaiserLite | null;
    approvals: ApprovalRow[];
  };
}

interface OrgPendingItem {
  requisitionId: string;
  requisitionNumber: string;
  title: string;
  priority: string;
  positions: number;
  department: { id: string; name: string } | null;
  raiser: { id: string; firstName: string; lastName: string } | null;
  currentLevel: number | null;
  currentRole: "DeptHead" | "HR" | null;
  currentApprover: { id: string; firstName: string; lastName: string } | null;
  waitingOnMe: boolean;
  approvedCount: number;
  totalLevels: number;
  raisedAt: string | null;
}

interface ApprovalsQueueResponse {
  mine: PendingItem[];
  all: OrgPendingItem[];
}

const PRIORITY_CLS: Record<string, string> = {
  Low:    "bg-slate-100 text-slate-600 ring-slate-200",
  Medium: "bg-green-50 text-green-700 ring-green-200",
  High:   "bg-amber-50 text-amber-700 ring-amber-200",
  Urgent: "bg-red-50 text-red-700 ring-red-200",
};

export default function RequisitionApprovalsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["requisition-approvals", "pending"],
    queryFn: () => api.get<ApprovalsQueueResponse>("/api/v1/hrms/recruit/requisitions/approvals-queue"),
  });
  const items = data?.data?.mine ?? [];
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const [decision, setDecision] = useState<{ kind: "approve" | "reject"; item: PendingItem } | null>(null);
  const [comment, setComment] = useState("");

  const decideMut = useMutation({
    mutationFn: ({ id, kind, comment: c }: { id: string; kind: "approve" | "reject"; comment?: string }) =>
      api.post(`/api/v1/hrms/recruit/requisitions/${id}/${kind}`, { comment: c || undefined }),
    onSuccess: (_r, vars) => {
      toast.success(vars.kind === "approve" ? "Approved" : "Rejected");
      qc.invalidateQueries({ queryKey: ["requisition-approvals"] });
      setDecision(null); setComment("");
      // Approve is a one-click action — send the user to the requisitions list.
      if (vars.kind === "approve") router.push("/recruit/requisitions");
    },
    onError: (e: unknown) => {
      // Surface the failure instead of leaving the row silently "stuck", and
      // refresh the queue in case the decision was already taken elsewhere.
      toast.error("Couldn't submit decision", e instanceof Error ? e.message : undefined);
      qc.invalidateQueries({ queryKey: ["requisition-approvals"] });
    },
  });

  // #6 — HR can edit the requisition (Timeline/ETA/Budget/etc.) before approving,
  // using the same shared wizard as New Requisition, in edit mode.
  const { data: deptsData } = useQuery({ queryKey: ["departments"], queryFn: () => api.get<DeptOption[]>("/api/v1/hrms/departments?limit=200") });
  const { data: pipelinesData } = useQuery({ queryKey: ["pipelines"], queryFn: () => api.get<PipelineOption[]>("/api/v1/hrms/recruit/pipelines") });
  const { data: empData } = useQuery({ queryKey: ["employees-picker"], queryFn: () => api.get<EmpOption[]>("/api/v1/hrms/employees?limit=500&status=Active&picker=1") });
  const { data: jobLevelsData } = useQuery({ queryKey: ["job-levels"], queryFn: () => api.get<JobLevelOption[]>("/api/v1/hrms/settings/job-levels") });

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ReqFormShape>(emptyReqForm);
  const [loadingEdit, setLoadingEdit] = useState(false);

  // Read-only "full details" view for approvers: shows the pending item's known
  // fields immediately, then enriches with the full requisition (requirements,
  // nice-to-have, benefits, target joining, etc.) once fetched.
  const [viewReq, setViewReq] = useState<PendingItem["requisition"] | null>(null);
  const [viewExtra, setViewExtra] = useState<FullReq | null>(null);
  const openDetails = async (req: PendingItem["requisition"]) => {
    setViewExtra(null);
    setViewReq(req);
    try {
      const res = await api.get<FullReq>(`/api/v1/hrms/recruit/requisitions/${req.id}`);
      if (res.data) setViewExtra(res.data);
    } catch { /* base fields still shown */ }
  };

  const openEdit = async (reqId: string) => {
    setLoadingEdit(true);
    try {
      const res = await api.get<FullReq>(`/api/v1/hrms/recruit/requisitions/${reqId}`);
      const r = res.data;
      if (!r) return;
      const numv = (v: string | number | null | undefined) => (v == null || v === "" ? null : Number(v));
      const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
      setEditForm({
        ...emptyReqForm,
        title: r.title ?? "",
        jobOpeningName: r.jobOpeningName ?? "",
        departmentId: r.department?.id ?? r.departmentId ?? "",
        pipelineId: r.pipelineId ?? "",
        positions: r.positions ?? 1,
        type: r.type ?? "NewPosition",
        priority: r.priority ?? "Medium",
        employmentType: r.employmentType ?? "FullTime",
        workLocation: r.workLocation ?? "Office",
        interviewPanelIds: arr(r.interviewPanel),
        reportingToId: r.reportingToId ?? "",
        hiringManagerId: r.hiringManager?.id ?? r.hiringManagerId ?? "",
        recruiterId: r.recruiter?.id ?? r.recruiterId ?? "",
        experienceMin: numv(r.experienceMin), experienceMax: numv(r.experienceMax),
        salaryMin: numv(r.salaryMin), salaryMax: numv(r.salaryMax), budget: numv(r.budget),
        targetJoiningDate: r.targetJoiningDate ? String(r.targetJoiningDate).slice(0, 10) : "",
        closedDate: r.closedDate ? String(r.closedDate).slice(0, 10) : "",
        etaToFillDays: numv(r.etaToFillDays), jobGrade: r.jobGrade ?? "", costCenter: r.costCenter ?? "",
        jobDescription: r.jobDescription ?? "",
        requirements: arr(r.requirements), niceToHave: arr(r.niceToHave), benefits: arr(r.benefits),
        education: r.education ?? "", passingYear: numv(r.passingYear), technicalQuestions: Array.isArray(r.technicalQuestions) ? r.technicalQuestions : [], referralBonusAmount: numv(r.referralBonusAmount),
        careerPageVisible: r.careerPageVisible ?? true, internalPostingOnly: r.internalPostingOnly ?? false, postToJobPortal: r.postToJobPortal ?? false,
        responsibilities: arr(r.responsibilities),
        skillWeights: Array.isArray(r.skillWeights) ? r.skillWeights : [],
        justification: r.justification ?? "",
      });
      setEditId(reqId);
    } catch (e) {
      toast.error("Failed to load requisition", e instanceof Error ? e.message : undefined);
    } finally {
      setLoadingEdit(false);
    }
  };

  const editMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReqFormShape }) =>
      api.patch(`/api/v1/hrms/recruit/requisitions/${id}`, toReqPayload(body)),
    onSuccess: () => {
      toast.success("Requisition updated");
      qc.invalidateQueries({ queryKey: ["requisition-approvals"] });
      setEditId(null);
    },
  });

  const stats = {
    total: items.length,
    deptHead: items.filter((i) => i.role === "DeptHead").length,
    hr: items.filter((i) => i.role === "HR").length,
  };

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Inbox size={28} className="text-[#22c55e] mt-1.5" />
          <div>
            <h1 className="text-page-title text-gray-900 leading-tight">Approve Requisitions</h1>
            <p className="text-xs text-gray-500 mt-1">Job requisitions raised by managers, awaiting your approval.</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[11px] font-semibold">
          <Inbox size={12} /> {stats.total} pending
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label="Total Pending" value={stats.total} color="amber" />
        <StatCard label="As Dept Head" value={stats.deptHead} color="blue" />
        <StatCard label="As HR" value={stats.hr} color="violet" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-300" />
            <p className="text-[13px] font-semibold">All caught up</p>
            <p className="text-xs text-slate-400 mt-0.5">No requisitions pending your approval.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pageItems.map((it) => {
              const r = it.requisition;
              const raiserName = r.raiser ? `${r.raiser.firstName} ${r.raiser.lastName}`.trim() : "—";
              const budgetHint = it.role === "HR" && it.openDeptHeadcount > 2;
              return (
                <li key={it.approvalId} className="p-4 hover:bg-slate-50/60">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Briefcase size={14} className="text-slate-500" />
                        <h3 className="text-[13px] font-semibold text-slate-900 truncate">{r.title}</h3>
                        <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium ring-1", PRIORITY_CLS[r.priority])}>{r.priority}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{r.requisitionNumber}</span>
                      </div>


                      {it.role === "HR" && (
                        <div className={clsx("mt-3 rounded-md px-2.5 py-1.5 text-[11px] border flex items-center gap-1.5",
                          budgetHint
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-50 text-slate-600 border-slate-200")}>
                          {budgetHint && <AlertTriangle size={11} />}
                          <span>
                            Budget context: <strong>{it.openDeptHeadcount}</strong> open requisition{it.openDeptHeadcount === 1 ? "" : "s"} in{" "}
                            <strong>{r.department?.name ?? "this dept"}</strong>{budgetHint ? " — review headcount closely." : "."}
                          </span>
                        </div>
                      )}

                      {r.justification && (
                        <div className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">Business justification</p>
                          <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{r.justification}</p>
                        </div>
                      )}

                      <button type="button" onClick={() => openDetails(r)}
                        className="mt-2 inline-flex items-center gap-1 text-[#22c55e] text-xs font-semibold hover:underline">
                        <FileText size={11} /> View full details
                      </button>
                    </div>

                    <div className="shrink-0 flex gap-2">
                      {it.role === "HR" && (
                        <button
                          onClick={() => openEdit(r.id)} disabled={loadingEdit}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-green-50 text-green-700 ring-1 ring-green-200 hover:bg-green-100 disabled:opacity-50">
                          <Pencil size={13} /> Edit
                        </button>
                      )}
                      <button
                        onClick={() => decideMut.mutate({ id: it.requisition.id, kind: "approve" })}
                        disabled={decideMut.isPending}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50">
                        <CheckCircle2 size={13} /> Approve
                      </button>
                      <button
                        onClick={() => { setComment(""); setDecision({ kind: "reject", item: it }); }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100">
                        <XIcon size={13} /> Reject
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!isLoading && items.length > 0 && (
          <Pagination page={page} totalPages={totalPages} total={items.length} limit={PAGE_SIZE} onPageChange={setPage} />
        )}
      </div>

      <Modal
        open={!!decision}
        onClose={() => !decideMut.isPending && setDecision(null)}
        title={decision?.kind === "approve" ? "Approve Requisition" : "Reject Requisition"}
        size="md"
      >
        {decision && (
          <form onSubmit={(e) => { e.preventDefault(); decideMut.mutate({ id: decision.item.requisition.id, kind: decision.kind, comment }); }} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
              <div className="font-semibold">{decision.item.requisition.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">{decision.item.requisition.department?.name ?? "—"} · {decision.item.requisition.positions} pos · {decision.item.role}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Comment {decision.kind === "reject" && "(recommended — shown to raiser)"}
              </label>
              <textarea
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={decision.kind === "approve" ? "Optional note for next approver / raiser…" : "Why is this being rejected? Budget / scope / timing?"}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setDecision(null)} disabled={decideMut.isPending}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={decideMut.isPending}
                className={clsx("px-3 py-1.5 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50",
                  decision.kind === "approve" ? "bg-gradient-to-r from-emerald-500 to-green-600" : "bg-gradient-to-r from-red-500 to-rose-600")}>
                {decideMut.isPending ? "Saving…" : decision.kind === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!editId} onClose={() => setEditId(null)} title="Edit Requisition" size="3xl">
        <RequisitionWizard
          form={editForm}
          setForm={setEditForm}
          isEdit
          departments={deptsData?.data ?? []}
          pipelines={pipelinesData?.data ?? []}
          employees={empData?.data ?? []}
          jobLevels={jobLevelsData?.data ?? []}
          submitting={editMut.isPending}
          onCancel={() => setEditId(null)}
          onSubmit={() => { if (editId) editMut.mutate({ id: editId, body: editForm }); }}
        />
      </Modal>

      {/* Full requisition details (read-only) for approvers */}
      <Modal
        open={!!viewReq}
        onClose={() => { setViewReq(null); setViewExtra(null); }}
        size="2xl"
        title={viewReq?.title ?? "Requisition"}
        subtitle={viewReq ? `${viewReq.requisitionNumber} · ${viewReq.type}` : ""}
      >
        {viewReq && (() => {
          const rng = (a: string | number | null, b: string | number | null, suffix: string) =>
            a != null || b != null ? `${a ?? "?"} – ${b ?? "?"} ${suffix}` : "—";
          const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
          const raiser = viewReq.raiser ? `${viewReq.raiser.firstName} ${viewReq.raiser.lastName}`.trim() : "—";
          const emps = empData?.data ?? [];
          const empName = (id?: string | null) => {
            if (!id) return "—";
            const e = emps.find((x) => x.id === id);
            return e ? (e.displayName?.trim() || `${e.firstName} ${e.lastName}`.trim()) : "—";
          };
          const fields: [string, string][] = [
            ["Department", viewReq.department?.name ?? "—"],
            ["Raised By", raiser],
            ["Employment Type", viewReq.employmentType ?? "—"],
            ["Work Location", viewReq.workLocation ?? "—"],
            ["Positions", String(viewReq.positions)],
            ["Priority", viewReq.priority ?? "—"],
            ["Experience", rng(viewReq.experienceMin ?? null, viewReq.experienceMax ?? null, "yrs")],
            ["Salary", rng(viewReq.salaryMin, viewReq.salaryMax, "LPA")],
            ...(viewExtra ? ([
              ["Budget", viewExtra.budget != null ? String(viewExtra.budget) : "—"],
              ["Target Joining", fmtDate(viewExtra.targetJoiningDate)],
              ["Hiring Manager", empName(viewExtra.hiringManager?.id ?? viewExtra.hiringManagerId)],
              ["Recruiter", empName(viewExtra.recruiter?.id ?? viewExtra.recruiterId)],
              ["Reports To", empName(viewExtra.reportingToId)],
              ["Job Grade", viewExtra.jobGrade ?? "—"],
              ["Cost Center", viewExtra.costCenter ?? "—"],
              ["Education", viewExtra.education ?? "—"],
              ["ETA to Fill", viewExtra.etaToFillDays != null ? `${viewExtra.etaToFillDays} days` : "—"],
              ["Referral Bonus", viewExtra.referralBonusAmount != null ? String(viewExtra.referralBonusAmount) : "—"],
            ] as [string, string][]) : []),
          ];
          const lists: [string, string[] | null | undefined][] = viewExtra ? [
            ["Requirements", viewExtra.requirements],
            ["Nice to Have", viewExtra.niceToHave],
            ["Responsibilities", viewExtra.responsibilities],
            ["Benefits", viewExtra.benefits],
          ] : [];
          return (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                {fields.map(([label, val]) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
                    <p className="text-gray-800">{val}</p>
                  </div>
                ))}
              </div>
              {viewReq.justification && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Business Justification</p>
                  <p className="text-gray-700 whitespace-pre-line leading-relaxed">{viewReq.justification}</p>
                </div>
              )}
              {viewExtra?.rolePurpose && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Role Purpose</p>
                  <p className="text-gray-700 whitespace-pre-line leading-relaxed">{viewExtra.rolePurpose}</p>
                </div>
              )}
              {viewReq.jobDescription && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Job Description</p>
                  <p className="text-gray-700 whitespace-pre-line leading-relaxed">{viewReq.jobDescription}</p>
                </div>
              )}
              {viewExtra?.skillWeights && viewExtra.skillWeights.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {viewExtra.skillWeights.map((s, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">
                        {s.skill}<span className="text-slate-400">· {s.weight}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {lists.map(([label, items]) => (items && items.length > 0) ? (
                <div key={label}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-gray-700">
                    {items.map((x, idx) => <li key={idx}>{x}</li>)}
                  </ul>
                </div>
              ) : null)}
              {!viewExtra && <p className="text-xs text-gray-400">Loading full details…</p>}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: "amber" | "blue" | "violet" }) {
  const cls = { amber: "bg-amber-50 text-amber-700", blue: "bg-green-50 text-green-700", violet: "bg-violet-50 text-violet-700" }[color];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
      <div>
        <p className="text-[11px] text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
      </div>
      <span className={`w-11 h-11 rounded-lg flex items-center justify-center ${cls}`}>
        <Inbox size={18} />
      </span>
    </div>
  );
}
