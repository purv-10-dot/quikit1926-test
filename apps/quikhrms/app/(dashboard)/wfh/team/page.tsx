"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { useToast } from "@/components/hrms/toast";
import { Home, Calendar, CheckCircle2, X as XIcon, Inbox, User } from "lucide-react";
import { clsx } from "clsx";
import { WfhTabs } from "../_components/wfh-tabs";
import { PageHeader } from "@/components/hrms/ui/page-header";

interface Approver { id: string; firstName: string; lastName: string; employeeCode: string }
interface ApprovalRow { id: string; level: number; role: string; status: string; comment: string | null; decidedAt: string | null }
interface RequestEmployee { id: string; firstName: string; lastName: string; employeeCode: string; jobTitle: string | null; department: { name: string } | null }
interface PendingItem {
  approvalId: string;
  level: number;
  role: "Manager" | "HR";
  request: {
    id: string;
    startDate: string;
    endDate: string;
    days: string;
    isHalfDay: boolean;
    session: string;
    reason: string;
    appliedOn: string;
    employee: RequestEmployee;
    approvals: ApprovalRow[];
  };
}

export default function WfhTeamPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["wfh", "team"],
    queryFn: () => api.get<PendingItem[]>("/api/v1/hrms/wfh/team"),
  });
  const items = data?.data ?? [];

  const [decision, setDecision] = useState<{ kind: "approve" | "reject"; item: PendingItem } | null>(null);
  const [comment, setComment] = useState("");

  const decideMut = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "approve" | "reject" }) =>
      api.post(`/api/v1/hrms/wfh/requests/${id}/${kind}`, { comment: comment || undefined }),
    onSuccess: (_r, vars) => {
      toast.success(vars.kind === "approve" ? "Approved" : "Rejected");
      qc.invalidateQueries({ queryKey: ["wfh"] });
      setDecision(null);
      setComment("");
    },
  });

  return (
    <div className="w-full px-5 py-4">
      <PageHeader
        icon={<Inbox size={28} className="text-[#22c55e]" />}
        title="WFH approvals"
        subtitle="WFH requests waiting for your approval."
        actions={
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-xs font-bold">
            <Inbox size={12} /> {items.length} pending
          </span>
        }
      />
      <div className="mb-5"><WfhTabs /></div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-300" />
            <p className="text-[13px] font-semibold">All caught up!</p>
            <p className="text-xs text-slate-400 mt-0.5">No WFH requests pending your approval.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Employee</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Date(s)</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Days</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Reason</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Approval Stage</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i, idx) => (
                <tr key={i.approvalId} className="row-stagger border-b border-slate-100 hover:bg-slate-50/60" style={{ ["--i" as never]: Math.min(idx, 10) }}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[11px] font-bold shrink-0">
                        {(i.request.employee.firstName[0] ?? "") + (i.request.employee.lastName[0] ?? "")}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-slate-900">{i.request.employee.firstName} {i.request.employee.lastName}</p>
                        <p className="text-[11px] text-slate-500">{i.request.employee.jobTitle ?? "—"} · {i.request.employee.department?.name ?? "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-700">
                    <div className="flex items-center gap-1.5"><Calendar size={12} className="text-slate-400" /> {fmtRange(i.request.startDate, i.request.endDate)}</div>
                    {i.request.isHalfDay && <p className="text-[11px] text-slate-400 mt-0.5">{i.request.session}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">{i.request.days}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 max-w-xs">{i.request.reason}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ring-1",
                      i.role === "Manager" ? "bg-green-50 text-green-700 ring-green-200" : "bg-purple-50 text-purple-700 ring-purple-200")}>
                      L{i.level} · {i.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => { setComment(""); setDecision({ kind: "approve", item: i }); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-normal bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                      >
                        <CheckCircle2 size={12} /> Approve
                      </button>
                      <button
                        onClick={() => { setComment(""); setDecision({ kind: "reject", item: i }); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-normal bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                      >
                        <XIcon size={12} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!decision} onClose={() => !decideMut.isPending && setDecision(null)} title={decision?.kind === "approve" ? "Approve WFH Request" : "Reject WFH Request"} size="md">
        {decision && (
          <form onSubmit={(e) => { e.preventDefault(); decideMut.mutate({ id: decision.item.request.id, kind: decision.kind }); }} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
              <div className="text-[13px] font-semibold">{decision.item.request.employee.firstName} {decision.item.request.employee.lastName}</div>
              <div className="text-xs text-slate-500 mt-0.5">{fmtRange(decision.item.request.startDate, decision.item.request.endDate)} · {decision.item.request.days} day(s)</div>
              <div className="text-xs text-slate-600 mt-2"><span className="text-slate-400">Reason:</span> {decision.item.request.reason}</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Comment {decision.kind === "reject" && "(recommended)"}</label>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={decision.kind === "approve" ? "Optional note for the employee..." : "Reason for rejection..."}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setDecision(null)} disabled={decideMut.isPending}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={decideMut.isPending}
                className={clsx("px-3 py-1.5 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50",
                  decision.kind === "approve" ? "bg-gradient-to-r from-emerald-500 to-green-600" : "bg-gradient-to-r from-red-500 to-rose-600")}>
                {decideMut.isPending ? "Saving..." : decision.kind === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function fmtRange(start: string, end: string): string {
  const fmt = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return start === end ? fmt(start) : `${fmt(start)} → ${fmt(end)}`;
}
