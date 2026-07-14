"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { LogOut, AlertTriangle, Info, CheckCircle2, Clock, RotateCcw, Send, Check, X, Users2 } from "lucide-react";
import { SkeletonLine } from "@/components/hrms/skeleton";

type ApprovalStatus = "Pending" | "Approved" | "Rejected" | null;

interface ResignResponse {
  instance: {
    id: string;
    resignationDate: string;
    lastWorkingDate: string;
    reason: string;
    status: "Initiated" | "OffboardInProgress" | "ClearancePending" | "OffboardCompleted";
    notes: string | null;
    createdAt: string;
    resignationApprovalStatus: ApprovalStatus;
    resignationRejectionReason: string | null;
  } | null;
  noticePeriodDays: number;
  status: string | null;
}

interface PendingResignation {
  id: string;
  resignationDate: string;
  lastWorkingDate: string;
  reason: string;
  notes: string | null;
  resignationApprovalStatus: ApprovalStatus;
  employee: {
    id: string; firstName: string; lastName: string; employeeCode: string;
    jobTitle: string | null; noticePeriodDays: number | null;
    department: { name: string } | null;
  };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  Initiated:         { label: "Pending HR acknowledgement", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  OffboardInProgress:{ label: "Offboarding in progress",    cls: "bg-[#dcfce7] text-[#16a34a] ring-[#22c55e]" },
  ClearancePending:  { label: "Clearance pending",          cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  OffboardCompleted: { label: "Offboarding completed",      cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ResignPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();

  const { data, isLoading } = useQuery({
    queryKey: ["resign", "me"],
    queryFn: () => api.get<ResignResponse>("/api/v1/hrms/offboarding/resign"),
  });

  const res = data?.data;
  const instance = res?.instance ?? null;
  const noticeDays = res?.noticePeriodDays ?? 0;
  // A rejected resignation is treated as "none" for the form (the employee can
  // submit again) but its reason is shown as a banner above the form.
  const activeInstance = instance && instance.resignationApprovalStatus !== "Rejected" ? instance : null;
  const rejected = instance && instance.resignationApprovalStatus === "Rejected" ? instance : null;
  const approvalChip = (s: ApprovalStatus): { label: string; cls: string } => {
    if (s === "Pending") return { label: "Pending manager approval", cls: "bg-amber-50 text-amber-700 ring-amber-200" };
    if (s === "Approved") return { label: "Approved by manager", cls: "bg-[#dcfce7] text-[#16a34a] ring-[#22c55e]" };
    if (s === "Rejected") return { label: "Rejected by manager", cls: "bg-red-50 text-red-700 ring-red-200" };
    return { label: "", cls: "" };
  };

  const [reason, setReason] = useState("");
  const [lastWorkingDate, setLastWorkingDate] = useState(addDays(todayIso(), noticeDays));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!instance) {
      setLastWorkingDate(addDays(todayIso(), noticeDays));
    }
  }, [noticeDays, instance]);

  const submitMut = useMutation({
    mutationFn: (body: { reason: string; lastWorkingDate: string; notes: string | null }) =>
      api.post("/api/v1/hrms/offboarding/resign", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resign"] });
      qc.invalidateQueries({ queryKey: ["employee", "me"] });
      toast.success("Resignation submitted", "HR will be notified shortly.");
      setReason(""); setNotes("");
    },
  });

  const withdrawMut = useMutation({
    mutationFn: () => api.delete("/api/v1/hrms/offboarding/resign"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resign"] });
      qc.invalidateQueries({ queryKey: ["employee", "me"] });
      toast.success("Resignation withdrawn");
    },
  });

  // ── Manager/HR approval queue ─────────────────────────────
  // Empty for employees who aren't anyone's approver, so this section simply
  // doesn't render for them.
  const { data: pendingResp } = useQuery({
    queryKey: ["resignation-approvals"],
    queryFn: () => api.get<PendingResignation[]>("/api/v1/hrms/offboarding/resignations?scope=pending"),
  });
  const pending = pendingResp?.data ?? [];

  const decideMut = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: "approve" | "reject"; reason?: string }) =>
      api.post(`/api/v1/hrms/offboarding/resignations/${id}/decision`, { action, reason }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["resignation-approvals"] });
      qc.invalidateQueries({ queryKey: ["resign"] });
      toast.success(vars.action === "approve" ? "Resignation approved" : "Resignation rejected");
    },
  });

  const handleApprove = async (r: PendingResignation) => {
    const name = `${r.employee.firstName} ${r.employee.lastName}`.trim();
    const ok = await dialog.confirm({
      title: "Approve resignation?",
      description: `Approve ${name}'s resignation? They will remain On Notice and HR will proceed with offboarding.`,
      confirmLabel: "Approve",
      variant: "info",
    });
    if (ok) decideMut.mutate({ id: r.id, action: "approve" });
  };

  const handleReject = async (r: PendingResignation) => {
    const name = `${r.employee.firstName} ${r.employee.lastName}`.trim();
    const reason = await dialog.promptText({
      title: "Reject resignation?",
      description: `Reject ${name}'s resignation? Their status returns to Active and they can re-submit. Give a reason:`,
      confirmLabel: "Reject",
      placeholder: "Reason for rejection",
    });
    if (reason && reason.trim()) decideMut.mutate({ id: r.id, action: "reject", reason: reason.trim() });
    else if (reason !== null) toast.error("Reason required", "A rejection reason is required.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("Reason required", "Tell HR why you are resigning.");
      return;
    }
    if (!lastWorkingDate) {
      toast.error("Last working date required");
      return;
    }
    const ok = await dialog.confirm({
      title: "Submit resignation?",
      description: `Your last working date will be ${new Date(lastWorkingDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}. Once submitted, HR will be notified and your status will change to "On Notice". You can withdraw while it is still pending.`,
      variant: "warning",
      confirmLabel: "Submit Resignation",
    });
    if (!ok) return;
    submitMut.mutate({ reason: reason.trim(), lastWorkingDate, notes: notes.trim() || null });
  };

  const handleWithdraw = async () => {
    const ok = await dialog.confirm({
      title: "Withdraw resignation?",
      description: "Your resignation will be cancelled and your status will return to Active. HR will be notified.",
      variant: "danger",
      confirmLabel: "Withdraw",
    });
    if (ok) withdrawMut.mutate();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-700 text-white flex items-center justify-center">
            <LogOut size={18} />
          </div>
          <div>
            <h1 className="text-page-title text-gray-900">Submit Resignation</h1>
            <p className="text-xs text-gray-500">Self-service resignation. HR will be notified once submitted.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            <SkeletonLine w="40%" h={16} />
            <SkeletonLine w="80%" h={12} />
            <SkeletonLine w="60%" h={12} />
            <SkeletonLine w="50%" h={12} />
          </div>
        ) : activeInstance ? (
          <div className="p-4 space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
              <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">You already have an active resignation on record.</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  {activeInstance.resignationApprovalStatus === "Pending"
                    ? "It is awaiting your reporting manager's approval. You can withdraw while it is still pending."
                    : "You can withdraw while it is still pending HR acknowledgement. Once HR moves it to offboarding-in-progress, you must contact HR directly to change anything."}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-slate-900">Your resignation</p>
                {activeInstance.resignationApprovalStatus ? (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${approvalChip(activeInstance.resignationApprovalStatus).cls}`}>
                    <Clock size={10} /> {approvalChip(activeInstance.resignationApprovalStatus).label}
                  </span>
                ) : (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${STATUS_META[activeInstance.status]?.cls ?? "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                    <Clock size={10} /> {STATUS_META[activeInstance.status]?.label ?? activeInstance.status}
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <Row label="Resignation date" value={new Date(activeInstance.resignationDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} />
                <Row label="Last working date" value={new Date(activeInstance.lastWorkingDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} />
                <Row label="Submitted at" value={new Date(activeInstance.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} />
                <Row label="Reason" value={activeInstance.reason} />
              </dl>
              {activeInstance.notes && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-600 mb-1">Notes</p>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">{activeInstance.notes}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              {activeInstance.status === "Initiated" ? (
                <button
                  type="button"
                  disabled={withdrawMut.isPending}
                  onClick={handleWithdraw}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md text-sm font-semibold"
                >
                  <RotateCcw size={13} /> {withdrawMut.isPending ? "Withdrawing..." : "Withdraw Resignation"}
                </button>
              ) : (
                <p className="text-xs text-gray-500">Contact HR for any changes to your offboarding.</p>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {rejected && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex gap-3">
                <X size={18} className="shrink-0 mt-0.5 text-red-600" />
                <div>
                  <p className="text-sm font-semibold text-red-900">Your previous resignation was rejected.</p>
                  {rejected.resignationRejectionReason && (
                    <p className="text-xs text-red-800 mt-0.5">Reason: {rejected.resignationRejectionReason}</p>
                  )}
                  <p className="text-xs text-red-800 mt-0.5">You can submit a new resignation below.</p>
                </div>
              </div>
            )}
            <div className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 flex gap-3">
              <Info size={18} className="shrink-0 mt-0.5 text-[#16a34a]" />
              <div>
                <p className="text-sm font-semibold text-[#166534]">Before you proceed</p>
                <p className="text-xs text-[#166534]/90 mt-0.5">
                  Your notice period is <strong>{noticeDays} {noticeDays === 1 ? "day" : "days"}</strong>. By default your last working date is set accordingly. HR can adjust it during offboarding. You can withdraw while the status is still pending.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you resigning? (e.g., better opportunity, personal reasons, relocation...)"
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Submission Date</label>
                <input
                  type="text"
                  readOnly
                  value={new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Last Working Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={lastWorkingDate}
                  min={todayIso()}
                  onChange={(e) => setLastWorkingDate(e.target.value)}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Additional notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything else you'd like HR to know — handover plans, preferred last day, etc."
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]"
              />
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-600" />
              <p>
                Submitting will change your employment status to <strong>On Notice</strong> and notify HR. A confirmation email may be sent to your work email.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <Link href="/dashboard" className="px-4 py-2 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-sm font-medium">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitMut.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white rounded-md text-sm font-semibold shadow-sm"
              >
                <Send size={13} /> {submitMut.isPending ? "Submitting..." : "Submit Resignation"}
              </button>
            </div>
          </form>
        )}
      </div>

      {pending.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white flex items-center gap-2">
            <Users2 size={16} className="text-amber-600" />
            <h2 className="text-sm font-bold text-gray-900">Team resignations awaiting your approval</h2>
            <span className="ml-auto text-[11px] font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">{pending.length}</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {pending.map((r) => (
              <li key={r.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {r.employee.firstName} {r.employee.lastName}
                    <span className="text-xs font-normal text-gray-400"> · {r.employee.employeeCode}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.employee.jobTitle || "—"}{r.employee.department ? ` · ${r.employee.department.name}` : ""}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Last working date: {new Date(r.lastWorkingDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                  {r.notes && <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{r.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" disabled={decideMut.isPending} onClick={() => handleApprove(r)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white">
                    <Check size={13} /> Approve
                  </button>
                  <button type="button" disabled={decideMut.isPending} onClick={() => handleReject(r)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                    <X size={13} /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="text-slate-500 min-w-[120px]">{label}</dt>
      <dd className="font-semibold text-slate-900 flex items-center gap-1">
        <CheckCircle2 size={11} className="text-emerald-500" /> {value}
      </dd>
    </div>
  );
}
