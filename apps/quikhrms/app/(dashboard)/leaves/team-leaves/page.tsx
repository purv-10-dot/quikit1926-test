"use client";

import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { clsx } from "clsx";
import { Check, X, User, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { Modal } from "@/components/hrms/modal";
import { useToast } from "@/components/hrms/toast";

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  duration: string;
  reason: string;
  status: string;
  appliedOn: string;
  employee: {
    id: string; firstName: string; lastName: string; employeeCode: string;
    profilePhoto: string | null;
    department: { id: string; name: string } | null;
  };
  leaveType: { id: string; name: string; code: string; color: string | null };
  approvals?: Array<{
    id: string; status: string; comment: string | null;
    approver: { id: string; firstName: string; lastName: string };
  }>;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const statusColors: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-700",
  Approved: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
  Cancelled: "bg-gray-100 text-gray-500",
};

export default function TeamLeavesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<"pending" | "history">("pending");

  // Confirm before actioning — approving/rejecting a leave is hard to reverse,
  // and the dialog also captures an (optional) note / rejection reason.
  const [decision, setDecision] = useState<{ kind: "Approved" | "Rejected"; req: LeaveRequest } | null>(null);
  const [comment, setComment] = useState("");

  // Fit the page to the remaining viewport height so it never scrolls the whole
  // page — each card scrolls internally instead. Measured at runtime so it
  // adapts to any top-bar height (same approach as the leave calendar).
  const rootRef = useRef<HTMLDivElement>(null);
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  useEffect(() => {
    const compute = () => {
      const el = rootRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setFitHeight(Math.max(360, window.innerHeight - top - 30));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Pending inbox is chain-driven + role-aware: the backend returns every
  // request whose *current* approval level the caller can action (anyone
  // holding that level's role, not just one routed approver).
  const { data: pendingData, isLoading } = useQuery({
    queryKey: ["team-leave-pending-approvals"],
    queryFn: () => api.get<LeaveRequest[]>("/api/v1/hrms/leaves/requests/pending-approvals"),
  });

  // History = every request the caller has an approval row on (routed to them
  // or already actioned by them), filtered to processed statuses.
  const { data: historyData } = useQuery({
    queryKey: ["team-leave-history"],
    queryFn: () => api.get<LeaveRequest[]>("/api/v1/hrms/leaves/requests?approverId=me&limit=50"),
  });

  const approveMut = useMutation({
    // Surfaced via toast below — suppress the global modal so the same failure
    // doesn't show a toast AND a blocking dialog.
    meta: { suppressGlobalError: true },
    mutationFn: ({ id, status, comment }: { id: string; status: string; comment?: string }) =>
      api.post(`/api/v1/hrms/leaves/requests/${id}/approve`, { status, comment }),
    onSuccess: (_r, vars) => {
      toast.success(vars.status === "Approved" ? "Leave approved" : "Leave rejected");
      qc.invalidateQueries({ queryKey: ["team-leave-pending-approvals"] });
      qc.invalidateQueries({ queryKey: ["team-leave-history"] });
      setDecision(null);
      setComment("");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not process the request");
    },
  });

  const pending = pendingData?.data ?? [];
  const processed = (historyData?.data ?? []).filter((r) => r.status !== "Pending");

  const tabs = [
    { key: "pending" as const, label: "Pending Approvals", count: pending.length },
    { key: "history" as const, label: "History", count: processed.length },
  ];

  return (
    <div
      ref={rootRef}
      className="w-full px-6 py-4 flex flex-col overflow-hidden"
      style={{ height: fitHeight ? `${fitHeight}px` : "calc(100dvh - 8rem)" }}
    >
      <h1 className="text-base font-semibold text-gray-900 mb-3 shrink-0">Team leaves</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-3 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "relative inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors -mb-px border-b-2 rounded-t-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
              tab === t.key
                ? "border-accent-600 text-accent-700"
                : "border-transparent text-gray-500 hover:text-gray-800",
            )}
          >
            {t.label}
            <span
              className={clsx(
                "inline-flex items-center justify-center min-w-[1.15rem] h-[1.05rem] px-1 rounded-full text-[11px] font-semibold",
                tab === t.key ? "bg-accent-100 text-accent-700" : "bg-gray-100 text-gray-500",
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Pending Approvals tab */}
      {tab === "pending" && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col min-h-0 flex-1">
          {isLoading ? (
            <div className="p-4 overflow-y-auto"><SkeletonTable rows={5} cols={5} /></div>
          ) : pending.length === 0 ? (
            <div className="p-4 flex-1 flex items-center justify-center"><EmptyState variant="inbox" size="sm" title="No pending approvals" description="All caught up! New leave requests will appear here." className="border-0 shadow-none" /></div>
          ) : (
            <div className="divide-y divide-gray-100 overflow-y-auto min-h-0">
              {pending.map((r) => (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-gray-50/60 transition-colors">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center mt-0.5 shrink-0">
                      <User size={13} className="text-gray-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 leading-tight">
                        {r.employee.firstName} {r.employee.lastName}
                        <span className="text-gray-400 font-normal ml-1">({r.employee.employeeCode})</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                        {r.leaveType.color && (
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.leaveType.color }} />
                        )}
                        <span className="text-xs text-gray-600">{r.leaveType.name}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs text-gray-500 tabular-nums">
                          {formatDate(r.startDate)} — {formatDate(r.endDate)} ({Number(r.duration)}d)
                        </span>
                      </div>
                      {r.reason && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.reason}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => { setComment(""); setDecision({ kind: "Approved", req: r }); }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded-md text-xs font-normal hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-1"
                    >
                      <Check size={12} /> Approve
                    </button>
                    <button
                      onClick={() => { setComment(""); setDecision({ kind: "Rejected", req: r }); }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-600 text-white rounded-md text-xs font-normal hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                    >
                      <X size={12} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col min-h-0 flex-1">
          {processed.length === 0 ? (
            <div className="p-4 flex-1 flex items-center justify-center"><EmptyState variant="folder" size="sm" title="No history" description="Approved + rejected team leaves show up here." className="border-0 shadow-none" /></div>
          ) : (
            <div className="overflow-auto min-h-0">
              <table className="w-full min-w-[640px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-accent-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Employee</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Type</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Period</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Days</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {processed.map((r, i) => (
                    <tr key={r.id} className="row-stagger border-b border-gray-100 hover:bg-gray-50/60 transition-colors" style={{ ["--i" as never]: Math.min(i, 10) }}>
                      <td className="px-4 py-2.5 text-[13px] font-medium text-gray-900">{r.employee.firstName} {r.employee.lastName}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{r.leaveType.name}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 tabular-nums">{formatDate(r.startDate)} — {formatDate(r.endDate)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 tabular-nums">{Number(r.duration)}</td>
                      <td className="px-4 py-2.5">
                        <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium", statusColors[r.status])}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Confirm approve / reject */}
      <Modal
        open={!!decision}
        onClose={() => !approveMut.isPending && (setDecision(null), setComment(""))}
        title={decision?.kind === "Approved" ? "Approve leave request" : "Reject leave request"}
        size="md"
      >
        {decision && (
          <form
            onSubmit={(e) => { e.preventDefault(); approveMut.mutate({ id: decision.req.id, status: decision.kind, comment: comment || undefined }); }}
            className="space-y-4"
          >
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-[13px] font-semibold text-gray-900">
                {decision.req.employee.firstName} {decision.req.employee.lastName}
                <span className="text-gray-400 font-normal ml-1">({decision.req.employee.employeeCode})</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {decision.req.leaveType.name} · {formatDate(decision.req.startDate)} — {formatDate(decision.req.endDate)} ({Number(decision.req.duration)}d)
              </div>
            </div>
            <div>
              <label htmlFor="decision-comment" className="block text-xs font-medium text-gray-700 mb-1">
                Comment {decision.kind === "Rejected" && <span className="text-gray-400 font-normal">(recommended)</span>}
              </label>
              <textarea
                id="decision-comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={decision.kind === "Approved" ? "Optional note for the employee…" : "Reason for rejection…"}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { setDecision(null); setComment(""); }}
                disabled={approveMut.isPending}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={approveMut.isPending}
                className={clsx(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                  decision.kind === "Approved"
                    ? "bg-green-600 hover:bg-green-700 focus-visible:ring-green-400"
                    : "bg-red-600 hover:bg-red-700 focus-visible:ring-red-400",
                )}
              >
                {approveMut.isPending && <Loader2 size={13} className="animate-spin" />}
                {approveMut.isPending
                  ? "Saving…"
                  : decision.kind === "Approved" ? "Approve" : "Reject"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
