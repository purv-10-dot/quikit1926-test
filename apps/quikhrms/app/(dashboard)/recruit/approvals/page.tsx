"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { Inbox, CheckCircle2, X as XIcon, Briefcase, Building2, Users, AlertTriangle, FileText } from "lucide-react";
import { clsx } from "clsx";

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

const PRIORITY_CLS: Record<string, string> = {
  Low:    "bg-slate-100 text-slate-600 ring-slate-200",
  Medium: "bg-blue-50 text-blue-700 ring-blue-200",
  High:   "bg-amber-50 text-amber-700 ring-amber-200",
  Urgent: "bg-red-50 text-red-700 ring-red-200",
};

export default function RequisitionApprovalsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["requisition-approvals", "pending"],
    queryFn: () => api.get<PendingItem[]>("/api/v1/hrms/recruit/requisitions/approvals-queue"),
  });
  const items = data?.data ?? [];

  const [decision, setDecision] = useState<{ kind: "approve" | "reject"; item: PendingItem } | null>(null);
  const [comment, setComment] = useState("");

  const decideMut = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "approve" | "reject" }) =>
      api.post(`/api/v1/hrms/recruit/requisitions/${id}/${kind}`, { comment: comment || undefined }),
    onSuccess: (_r, vars) => {
      toast.success(vars.kind === "approve" ? "Approved" : "Rejected");
      qc.invalidateQueries({ queryKey: ["requisition-approvals"] });
      setDecision(null); setComment("");
    },
    onError: (e: Error) => toast.error("Action failed", e.message),
  });

  const stats = {
    total: items.length,
    deptHead: items.filter((i) => i.role === "DeptHead").length,
    hr: items.filter((i) => i.role === "HR").length,
  };

  return (
    <div className="w-full px-6 py-6">
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <Inbox size={28} className="text-[#3b82f6] mt-1.5" />
          <div>
            <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900 leading-tight">Requisition approvals</h1>
            <p className="text-sm text-gray-500 mt-1">Job requisitions raised by managers, awaiting your approval.</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-xs font-bold">
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
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-300" />
            <p className="text-sm font-medium">All caught up</p>
            <p className="text-xs text-slate-400 mt-0.5">No requisitions pending your approval.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((it) => {
              const r = it.requisition;
              const raiserName = r.raiser ? `${r.raiser.firstName} ${r.raiser.lastName}`.trim() : "—";
              const budgetHint = it.role === "HR" && it.openDeptHeadcount > 2;
              return (
                <li key={it.approvalId} className="p-4 hover:bg-slate-50/60">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Briefcase size={14} className="text-slate-500" />
                        <h3 className="text-base font-bold text-slate-900 truncate">{r.title}</h3>
                        <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-bold ring-1", PRIORITY_CLS[r.priority])}>{r.priority}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{r.requisitionNumber}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1"><Building2 size={11} /> {r.department?.name ?? "—"}</span>
                        <span className="inline-flex items-center gap-1"><Users size={11} /> {r.positions} position{r.positions === 1 ? "" : "s"}</span>
                        <span>{r.employmentType}</span>
                        <span>{r.workLocation}</span>
                        <span>·</span>
                        <span>Raised by <strong className="text-slate-700">{raiserName}</strong>{r.raiser?.jobTitle ? ` (${r.raiser.jobTitle})` : ""}</span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded ring-1 bg-blue-50 text-blue-700 ring-blue-200">L{it.level} · {it.role === "DeptHead" ? "Dept Head" : "HR"}</span>
                        {(r.experienceMin != null || r.experienceMax != null) && (
                          <span className="px-2 py-0.5 rounded ring-1 bg-slate-50 text-slate-600 ring-slate-200">
                            {r.experienceMin ?? 0}–{r.experienceMax ?? "?"} yrs exp
                          </span>
                        )}
                        {(r.salaryMin || r.salaryMax) && (
                          <span className="px-2 py-0.5 rounded ring-1 bg-slate-50 text-slate-600 ring-slate-200">
                            ₹ {r.salaryMin ?? "?"} – {r.salaryMax ?? "?"}
                          </span>
                        )}
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

                      {r.jobDescription && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer text-[#3b82f6] font-semibold inline-flex items-center gap-1">
                            <FileText size={11} /> View job description
                          </summary>
                          <p className="mt-2 text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-md p-3 border border-slate-200 leading-relaxed">{r.jobDescription}</p>
                        </details>
                      )}
                    </div>

                    <div className="shrink-0 flex gap-2">
                      <button
                        onClick={() => { setComment(""); setDecision({ kind: "approve", item: it }); }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">
                        <CheckCircle2 size={12} /> Approve
                      </button>
                      <button
                        onClick={() => { setComment(""); setDecision({ kind: "reject", item: it }); }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100">
                        <XIcon size={12} /> Reject
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal
        open={!!decision}
        onClose={() => !decideMut.isPending && setDecision(null)}
        title={decision?.kind === "approve" ? "Approve Requisition" : "Reject Requisition"}
        size="md"
      >
        {decision && (
          <form onSubmit={(e) => { e.preventDefault(); decideMut.mutate({ id: decision.item.requisition.id, kind: decision.kind }); }} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
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
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setDecision(null)} disabled={decideMut.isPending}
                className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={decideMut.isPending}
                className={clsx("px-5 py-2 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50",
                  decision.kind === "approve" ? "bg-gradient-to-r from-emerald-500 to-green-600" : "bg-gradient-to-r from-red-500 to-rose-600")}>
                {decideMut.isPending ? "Saving…" : decision.kind === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: "amber" | "blue" | "violet" }) {
  const cls = { amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700" }[color];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
      <div>
        <p className="text-[11px] text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
      </div>
      <span className={`w-11 h-11 rounded-lg flex items-center justify-center ${cls}`}>
        <Inbox size={18} />
      </span>
    </div>
  );
}
