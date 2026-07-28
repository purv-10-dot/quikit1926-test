"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Check, X, ExternalLink } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { Pagination } from "@/components/hrms/pagination";

interface Claim {
  id: string;
  employeeId: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; department: { name: string } | null } | null;
  componentName: string;
  billDate: string;
  billNumber: string | null;
  amountClaimed: string | number;
  amountApproved: string | number | null;
  fileUrl: string | null;
  description: string | null;
  status: "Submitted" | "Approved" | "Rejected" | "Paid" | "Cancelled" | "Draft";
  rejectionReason: string | null;
  createdAt: string;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const STATUSES = ["Submitted", "Approved", "Rejected", "Paid"] as const;

export function ReimbursementsTab() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Submitted");
  const [target, setTarget] = useState<{ claim: Claim; action: "approve" | "reject" } | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "approvals", "reimbursements", status],
    queryFn: () => api.get<Claim[]>(`/api/v1/hrms/payroll/approvals/reimbursements?status=${status}`),
  });

  const rows = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageItems = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const approveMut = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api.post(`/api/v1/hrms/payroll/approvals/reimbursements/${id}/approve`, { amountApproved: amount }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll", "approvals"] }); setTarget(null); },
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/api/v1/hrms/payroll/approvals/reimbursements/${id}/reject`, { rejectionReason: reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll", "approvals"] }); setTarget(null); },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1); }}
            className={clsx(
              "px-3 py-1 text-xs rounded-full border transition",
              status === s ? "bg-green-600 text-white border-[#22c55e]" : "bg-white text-gray-600 border-gray-300 hover:border-[#86efac]",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-xs text-gray-500">No {status.toLowerCase()} reimbursement claims.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-left py-2 px-3">Component</th>
                <th className="text-left py-2 px-3">Bill Date</th>
                <th className="text-right py-2 px-3">Claimed</th>
                <th className="text-right py-2 px-3">Approved</th>
                <th className="text-left py-2 px-3">Bill</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r, i) => (
                <tr key={r.id} className="row-stagger border-b border-gray-50 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="py-3 px-3">
                    <p className="text-[13px] font-medium text-gray-900">{r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "Unknown"}</p>
                    <p className="text-xs text-gray-500">{r.employee?.employeeCode}</p>
                  </td>
                  <td className="py-3 px-3 text-xs text-gray-700">{r.componentName}</td>
                  <td className="py-3 px-3 text-xs text-gray-700">{new Date(r.billDate).toLocaleDateString("en-IN")}</td>
                  <td className="py-3 px-3 text-right text-gray-900">₹{INR.format(Number(r.amountClaimed))}</td>
                  <td className="py-3 px-3 text-right text-gray-900">{r.amountApproved != null ? `₹${INR.format(Number(r.amountApproved))}` : "—"}</td>
                  <td className="py-3 px-3">
                    {r.fileUrl ? (
                      <a href={r.fileUrl} target="_blank" rel="noreferrer" className="text-[#22c55e] hover:underline inline-flex items-center gap-1 text-xs">
                        View <ExternalLink size={10} />
                      </a>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {r.status === "Submitted" && (
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => setTarget({ claim: r, action: "approve" })}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded"
                        >
                          <Check size={12} /> Approve
                        </button>
                        <button
                          onClick={() => setTarget({ claim: r, action: "reject" })}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                        >
                          <X size={12} /> Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={rows.length} limit={PAGE_SIZE} onPageChange={setPage} />
        </div>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title={target?.action === "approve" ? "Approve Claim" : "Reject Claim"} size="sm">
        {target && (
          <ActionForm
            claim={target.claim}
            action={target.action}
            onCancel={() => setTarget(null)}
            onSubmit={(v) => {
              if (target.action === "approve") approveMut.mutate({ id: target.claim.id, amount: v.amount ?? Number(target.claim.amountClaimed) });
              else rejectMut.mutate({ id: target.claim.id, reason: v.reason ?? "" });
            }}
            pending={approveMut.isPending || rejectMut.isPending}
          />
        )}
      </Modal>
    </div>
  );
}

function ActionForm({
  claim, action, onCancel, onSubmit, pending,
}: {
  claim: Claim; action: "approve" | "reject";
  onCancel: () => void;
  onSubmit: (v: { amount?: number | null; reason?: string }) => void;
  pending: boolean;
}) {
  const [amount, setAmount] = useState<number | null>(Number(claim.amountClaimed));
  const [reason, setReason] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ amount, reason }); }} className="p-4 space-y-3">
      <div className="rounded bg-gray-50 border border-gray-200 p-3 text-xs">
        <p className="font-semibold">{claim.employee ? `${claim.employee.firstName} ${claim.employee.lastName}` : "—"}</p>
        <p className="text-gray-600">{claim.componentName} · ₹{INR.format(Number(claim.amountClaimed))}</p>
      </div>
      {action === "approve" ? (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Approved Amount (₹)</label>
          <NumberInput value={amount} onChange={(v) => setAmount(v)} className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md" />
          <p className="text-[11px] text-gray-500 mt-1">Can approve partial amount (e.g. if some bill items ineligible).</p>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Rejection Reason <span className="text-red-500">*</span></label>
          <textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md" />
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium">Cancel</button>
        <button type="submit" disabled={pending}
          className={clsx(
            "px-3 py-1.5 text-white rounded-md text-xs font-medium shadow-sm disabled:opacity-60",
            action === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700",
          )}>
          {pending ? "Submitting..." : action === "approve" ? "Approve" : "Reject"}
        </button>
      </div>
    </form>
  );
}
