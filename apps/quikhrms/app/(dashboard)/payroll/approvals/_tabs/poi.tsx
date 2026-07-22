"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Check, ExternalLink } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface Proof {
  id: string;
  employeeId: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; department: { name: string } | null } | null;
  financialYear: string;
  section: string;
  investmentType: string;
  declaredAmount: string | number;
  proofAmount: string | number;
  approvedAmount: string | number | null;
  fileUrl: string | null;
  status: "Submitted" | "UnderReview" | "Approved" | "PartiallyApproved" | "Rejected";
  rejectionReason: string | null;
  createdAt: string;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const STATUSES = ["Submitted", "UnderReview", "Approved", "PartiallyApproved", "Rejected"] as const;

export function POITab() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Submitted");
  const [target, setTarget] = useState<Proof | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "approvals", "poi", status],
    queryFn: () => api.get<Proof[]>(`/api/v1/hrms/payroll/approvals/poi?status=${status}`),
  });

  const rows = data?.data ?? [];

  const reviewMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post(`/api/v1/hrms/payroll/approvals/poi/${id}/review`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll", "approvals", "poi"] }); setTarget(null); },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={clsx(
              "px-3 py-1 text-xs rounded-full border transition",
              status === s ? "bg-green-600 text-white border-[#22c55e]" : "bg-white text-gray-600 border-gray-300 hover:border-[#86efac]",
            )}
          >
            {s.replace(/([A-Z])/g, " $1").trim()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-xs text-gray-500">No {status.toLowerCase()} investment proofs.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-left py-2 px-3">FY</th>
                <th className="text-left py-2 px-3">Section</th>
                <th className="text-left py-2 px-3">Investment</th>
                <th className="text-right py-2 px-3">Declared</th>
                <th className="text-right py-2 px-3">Proof</th>
                <th className="text-right py-2 px-3">Approved</th>
                <th className="text-left py-2 px-3">Doc</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="row-stagger border-b border-gray-50 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="py-3 px-3">
                    <p className="text-[13px] font-medium text-gray-900">{r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "Unknown"}</p>
                    <p className="text-xs text-gray-500">{r.employee?.employeeCode}</p>
                  </td>
                  <td className="py-3 px-3 text-xs text-gray-700">{r.financialYear}</td>
                  <td className="py-3 px-3 text-xs text-gray-700">{r.section}</td>
                  <td className="py-3 px-3 text-xs text-gray-700">{r.investmentType.replace(/([A-Z])/g, " $1").trim()}</td>
                  <td className="py-3 px-3 text-right text-gray-900">₹{INR.format(Number(r.declaredAmount))}</td>
                  <td className="py-3 px-3 text-right text-gray-900">₹{INR.format(Number(r.proofAmount))}</td>
                  <td className="py-3 px-3 text-right text-gray-900">{r.approvedAmount != null ? `₹${INR.format(Number(r.approvedAmount))}` : "—"}</td>
                  <td className="py-3 px-3">
                    {r.fileUrl ? (
                      <a href={r.fileUrl} target="_blank" rel="noreferrer" className="text-[#22c55e] hover:underline inline-flex items-center gap-1 text-xs">
                        View <ExternalLink size={10} />
                      </a>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {(r.status === "Submitted" || r.status === "UnderReview") && (
                      <button
                        onClick={() => setTarget(r)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
                      >
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title="Review Investment Proof" size="md">
        {target && (
          <ReviewForm
            proof={target}
            onCancel={() => setTarget(null)}
            onSubmit={(body) => reviewMut.mutate({ id: target.id, body })}
            pending={reviewMut.isPending}
          />
        )}
      </Modal>
    </div>
  );
}

function ReviewForm({
  proof, onCancel, onSubmit, pending,
}: {
  proof: Proof; onCancel: () => void;
  onSubmit: (v: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [status, setStatus] = useState<"Approved" | "PartiallyApproved" | "Rejected" | "UnderReview">("Approved");
  const [approvedAmount, setApprovedAmount] = useState<number | null>(Number(proof.proofAmount));
  const [reason, setReason] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ status, approvedAmount, rejectionReason: reason || null }); }} className="p-4 space-y-3">
      <div className="rounded bg-gray-50 border border-gray-200 p-3 text-xs">
        <p className="font-semibold">{proof.employee ? `${proof.employee.firstName} ${proof.employee.lastName}` : "—"}</p>
        <p className="text-gray-600">{proof.section} · {proof.investmentType.replace(/([A-Z])/g, " $1").trim()} · FY {proof.financialYear}</p>
        <p className="text-gray-600">Declared ₹{INR.format(Number(proof.declaredAmount))} · Proof ₹{INR.format(Number(proof.proofAmount))}</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Decision</label>
        <Select
          value={status}
          onChange={(v) => setStatus(v as typeof status)}
          options={[
            { value: "Approved", label: "Approved (full proof amount)" },
            { value: "PartiallyApproved", label: "Partially Approved" },
            { value: "UnderReview", label: "Under Review" },
            { value: "Rejected", label: "Rejected" },
          ]}
        />
      </div>

      {status !== "Rejected" && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Approved Amount (₹)</label>
          <NumberInput value={approvedAmount} onChange={(v) => setApprovedAmount(v)} className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md" />
        </div>
      )}
      {(status === "Rejected" || status === "PartiallyApproved") && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Remarks {status === "Rejected" && <span className="text-red-500">*</span>}</label>
          <textarea required={status === "Rejected"} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md" />
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium">Cancel</button>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm">
          <Check size={13} /> {pending ? "Submitting..." : "Submit Review"}
        </button>
      </div>
    </form>
  );
}
