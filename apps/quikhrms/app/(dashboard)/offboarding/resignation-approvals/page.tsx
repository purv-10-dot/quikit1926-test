"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { EmptyState } from "@/components/hrms/empty-state";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { PageBackground } from "@/components/hrms/page-background";
import { Pagination } from "@/components/hrms/pagination";
import { TabSwitcher } from "@/components/hrms/tab-switcher";
import { clsx } from "clsx";
import { ShieldCheck, Check, X, CalendarClock, Clock } from "lucide-react";

interface EmployeeMini {
  id: string; firstName: string; lastName: string;
  employeeCode: string | null; jobTitle: string | null;
  profilePhoto: string | null; noticePeriodDays: number | null;
  department: { name: string } | null;
}

interface Resignation {
  id: string;
  resignationDate: string;
  lastWorkingDate: string | null;
  reason: string;
  notes: string | null;
  resignationApprovalStatus: "Pending" | "Approved" | "Rejected" | null;
  resignationDecisionAt: string | null;
  resignationRejectionReason: string | null;
  createdAt: string;
  employeeId: string;
  employee: EmployeeMini | null;
}

interface NoticePeriodOption { id: string; name: string; duration: number; unit: "Days" | "Weeks" | "Months"; }

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const periodToDays = (p: NoticePeriodOption) =>
  p.unit === "Months" ? p.duration * 30 : p.unit === "Weeks" ? p.duration * 7 : p.duration;

const STATUS_STYLE: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Approved: "bg-green-50 text-green-700 ring-green-200",
  Rejected: "bg-red-50 text-red-700 ring-red-200",
};

export default function ResignationApprovalsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();
  const { hasPermission, isLoading: permsLoading } = useDashboardConfig();
  const canApprove = hasPermission("hrms.offboarding.approve");

  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [approveFor, setApproveFor] = useState<Resignation | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const { data, isLoading } = useQuery({
    queryKey: ["resignation-approvals", tab],
    queryFn: () => api.get<Resignation[]>(`/api/v1/hrms/offboarding/resignations?scope=${tab === "pending" ? "pending" : "all"}`),
    enabled: canApprove,
  });
  const rows = useMemo(() => data?.data ?? [], [data]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageItems = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const decideMut = useMutation({
    mutationFn: ({ id, action, reason, noticePeriodId }: { id: string; action: "approve" | "reject"; reason?: string; noticePeriodId?: string }) =>
      api.post(`/api/v1/hrms/offboarding/resignations/${id}/decision`, { action, reason, noticePeriodId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["resignation-approvals"] });
      setApproveFor(null);
      toast.success(vars.action === "approve" ? "Resignation approved" : "Resignation rejected");
    },
    onError: (e: unknown) => toast.error("Action failed", e instanceof Error ? e.message : undefined),
  });

  const onReject = async (r: Resignation) => {
    const reason = await dialog.promptText({
      title: "Reject this resignation?",
      description: `${r.employee?.firstName ?? "Employee"}'s status returns to Active and they can re-submit.`,
      confirmLabel: "Reject",
      placeholder: "Reason for rejection",
    });
    if (reason && reason.trim()) decideMut.mutate({ id: r.id, action: "reject", reason: reason.trim() });
    else if (reason !== null) toast.error("Reason required", "A rejection reason is required.");
  };

  if (!permsLoading && !canApprove) {
    return (
      <EmptyState
        variant="folder"
        title="You don't have access to Resignation Approvals"
        description="This section is restricted to approvers. Contact your administrator if you need access."
      />
    );
  }

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center gap-3 mb-4">
        <ShieldCheck size={28} className="text-[#22c55e]" />
        <div>
          <h1 className="text-base font-semibold text-gray-900">Resignation Approvals</h1>
          <p className="text-xs text-gray-500 mt-0.5">Review and act on employee resignations. Approvers are set in Settings → Approval Chains (Offboarding).</p>
        </div>
      </div>

      <TabSwitcher
        className="mb-4"
        value={tab}
        onChange={(v) => { setTab(v as "pending" | "all"); setPage(1); }}
        tabs={[
          { value: "pending", label: "Pending", icon: <Clock size={14} /> },
          { value: "all", label: "All", icon: <CalendarClock size={14} /> },
        ]}
      />

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            {tab === "pending" ? "No resignations awaiting approval." : "No resignations yet."}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-accent-50 text-[11px] font-semibold tracking-[0.04em] uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2.5">Employee</th>
                <th className="text-left px-4 py-2.5">Reason</th>
                <th className="text-left px-4 py-2.5">Resigned On</th>
                <th className="text-left px-4 py-2.5">Last Working</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5">
                    <div className="text-[13px] font-medium text-gray-900">
                      {r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "—"}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {r.employee?.employeeCode ?? ""}{r.employee?.department?.name ? ` · ${r.employee.department.name}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 max-w-[280px]">
                    <span className="line-clamp-2 whitespace-pre-line" title={r.notes ?? undefined}>
                      {r.notes?.trim() || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">{fmt(r.resignationDate)}</td>
                  <td className="px-4 py-2.5 text-gray-700">{fmt(r.lastWorkingDate)}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ring-1", STATUS_STYLE[r.resignationApprovalStatus ?? "Pending"])}>
                      {r.resignationApprovalStatus ?? "Pending"}
                    </span>
                    {r.resignationApprovalStatus === "Rejected" && r.resignationRejectionReason && (
                      <div className="text-[11px] text-red-500 mt-0.5">{r.resignationRejectionReason}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.resignationApprovalStatus === "Pending" ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setApproveFor(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold"
                        >
                          <Check size={12} /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onReject(r)}
                          disabled={decideMut.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 text-[11px] font-semibold"
                        >
                          <X size={12} /> Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-400">{fmt(r.resignationDecisionAt)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && rows.length > 0 && (
          <Pagination page={page} totalPages={totalPages} total={rows.length} limit={PAGE_SIZE} onPageChange={setPage} />
        )}
      </div>

      {approveFor && (
        <ApproveModal
          resignation={approveFor}
          onClose={() => setApproveFor(null)}
          onConfirm={(noticePeriodId) => decideMut.mutate({ id: approveFor.id, action: "approve", noticePeriodId })}
          pending={decideMut.isPending}
        />
      )}
    </div>
  );
}

function ApproveModal({ resignation, onClose, onConfirm, pending }: {
  resignation: Resignation;
  onClose: () => void;
  onConfirm: (noticePeriodId?: string) => void;
  pending: boolean;
}) {
  const api = useApiClient();
  const [noticePeriodId, setNoticePeriodId] = useState("");

  const { data } = useQuery({
    queryKey: ["notice-periods", "all"],
    queryFn: () => api.get<NoticePeriodOption[]>("/api/v1/hrms/offboarding/notice-periods?limit=100"),
  });
  const noticePeriods = data?.data ?? [];

  const selected = noticePeriods.find((n) => n.id === noticePeriodId);
  const computedLwd = (() => {
    if (!selected) return null;
    const d = new Date(resignation.resignationDate);
    d.setDate(d.getDate() + periodToDays(selected));
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  })();

  return (
    <Modal open onClose={onClose} title="Approve Resignation" headerIcon={<Check size={18} />} size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Approving <span className="font-semibold text-gray-900">{resignation.employee?.firstName} {resignation.employee?.lastName}</span>&apos;s resignation.
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Set / adjust notice period <span className="text-gray-400">(optional)</span>
          </label>
          <Select
            value={noticePeriodId}
            onChange={(v) => setNoticePeriodId(v)}
            placeholder={noticePeriods.length ? "Keep current — or pick one to change" : "No notice periods configured"}
            options={noticePeriods.map((n) => ({ value: n.id, label: `${n.name} (${n.duration} ${n.unit})` }))}
          />
          <p className="text-[11px] text-gray-500 mt-1">
            {computedLwd
              ? `New last working date: ${computedLwd}`
              : `Current last working date: ${fmt(resignation.lastWorkingDate)}`}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            onClick={() => onConfirm(noticePeriodId || undefined)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold"
          >
            <Check size={13} /> {pending ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
