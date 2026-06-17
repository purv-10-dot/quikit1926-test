"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { ChevronLeft, LogOut, AlertTriangle, Info, CheckCircle2, Clock, RotateCcw, Send } from "lucide-react";
import { SkeletonLine } from "@/components/hrms/skeleton";

interface ResignResponse {
  instance: {
    id: string;
    resignationDate: string;
    lastWorkingDate: string;
    reason: string;
    status: "Initiated" | "OffboardInProgress" | "ClearancePending" | "OffboardCompleted";
    notes: string | null;
    createdAt: string;
  } | null;
  noticePeriodDays: number;
  status: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  Initiated:         { label: "Pending HR acknowledgement", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  OffboardInProgress:{ label: "Offboarding in progress",    cls: "bg-[#dbeafe] text-[#2563eb] ring-[#3b82f6]" },
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
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#3b82f6]">
        <ChevronLeft size={14} /> Back to Dashboard
      </Link>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-700 text-white flex items-center justify-center">
            <LogOut size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Submit Resignation</h1>
            <p className="text-xs text-gray-500">Self-service resignation. HR will be notified once submitted.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-2">
            <SkeletonLine w="40%" h={16} />
            <SkeletonLine w="80%" h={12} />
            <SkeletonLine w="60%" h={12} />
            <SkeletonLine w="50%" h={12} />
          </div>
        ) : instance ? (
          <div className="p-5 space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
              <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">You already have an active resignation on record.</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  You can withdraw while it is still pending HR acknowledgement. Once HR moves it to offboarding-in-progress, you must contact HR directly to change anything.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-slate-900">Your resignation</p>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${STATUS_META[instance.status]?.cls ?? "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                  <Clock size={10} /> {STATUS_META[instance.status]?.label ?? instance.status}
                </span>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <Row label="Resignation date" value={new Date(instance.resignationDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} />
                <Row label="Last working date" value={new Date(instance.lastWorkingDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} />
                <Row label="Submitted at" value={new Date(instance.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} />
                <Row label="Reason" value={instance.reason} />
              </dl>
              {instance.notes && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-600 mb-1">Notes</p>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">{instance.notes}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              {instance.status === "Initiated" ? (
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
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 flex gap-3">
              <Info size={18} className="shrink-0 mt-0.5 text-[#2563eb]" />
              <div>
                <p className="text-sm font-semibold text-[#1e40af]">Before you proceed</p>
                <p className="text-xs text-[#1e40af]/90 mt-0.5">
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
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
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
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
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
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]"
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
