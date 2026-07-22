"use client";

import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { Check, X, FileText, Inbox, Loader2 } from "lucide-react";
import { clsx } from "clsx";

type POIStatus = "Submitted" | "UnderReview" | "Approved" | "PartiallyApproved" | "Rejected";

interface InvestmentProofRow {
  id: string;
  employeeId: string;
  financialYear: string;
  section: string;
  investmentType: string;
  declaredAmount: string;
  proofAmount: string;
  approvedAmount: string | null;
  fileUrl: string | null;
  remarks: string | null;
  status: POIStatus;
  reviewedAt: string | null;
  rejectionReason: string | null;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department: { name: string } | null;
  } | null;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr = (v: string | number | null) => `₹${INR.format(Math.round(Number(v ?? 0)))}`;

const STATUS_FILTERS: { value: POIStatus | ""; label: string }[] = [
  { value: "",                  label: "All statuses" },
  { value: "Submitted",         label: "Submitted (pending review)" },
  { value: "UnderReview",       label: "Under review" },
  { value: "Approved",          label: "Approved" },
  { value: "PartiallyApproved", label: "Partially approved" },
  { value: "Rejected",          label: "Rejected" },
];

function currentFY(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 4 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

export function PoiReview() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<POIStatus | "">("Submitted");
  const [fy, setFy] = useState(currentFY());
  const [reviewing, setReviewing] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "poi-review", fy, status],
    queryFn: () => api.get<InvestmentProofRow[]>(
      `/api/v1/hrms/payroll/approvals/poi?fy=${encodeURIComponent(fy)}${status ? `&status=${status}` : ""}`,
    ),
  });
  const rows = data?.data ?? [];

  const reviewMut = useMutation({
    mutationFn: (args: { id: string; body: Record<string, unknown> }) =>
      api.post(`/api/v1/hrms/payroll/approvals/poi/${args.id}/review`, args.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "poi-review"] });
      setReviewing(null);
      toast.success("Review saved");
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-gray-900">Investment proof review queue</p>
          <p className="text-xs text-gray-500">
            {isLoading ? "Loading…" : `${rows.length} proof${rows.length === 1 ? "" : "s"} matching filters`}
          </p>
        </div>
        <div className="flex gap-2">
          <Select
            value={status}
            onChange={(v) => setStatus(v as POIStatus | "")}
            options={STATUS_FILTERS}
            className="w-52"
          />
          <Select
            value={fy}
            onChange={setFy}
            options={Array.from({ length: 4 }, (_, i) => {
              const y = new Date().getFullYear() - i + 1;
              const label = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
              return { value: label, label: `FY ${label}` };
            })}
            className="w-36"
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={6} /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center">
            <Inbox size={32} className="mx-auto text-gray-300" />
            <p className="text-xs text-gray-600 mt-2">No proofs matching this filter.</p>
            <p className="text-xs text-gray-500 mt-0.5">
              When employees submit Form 12BB, a review row is auto-created for each claimed section.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50/60">
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-left py-2 px-3">Section</th>
                <th className="text-right py-2 px-3">Declared</th>
                <th className="text-right py-2 px-3">Proof</th>
                <th className="text-right py-2 px-3">Approved</th>
                <th className="text-left py-2 px-3">Doc</th>
                <th className="text-center py-2 px-3">Status</th>
                <th className="text-right py-2 px-3 w-44">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpenReview = reviewing === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-gray-50 hover:bg-gray-50/40">
                      <td className="py-2.5 px-3">
                        <p className="text-[13px] font-medium text-gray-900">
                          {r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "—"}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {r.employee?.employeeCode ?? "—"}
                          {r.employee?.department?.name && ` · ${r.employee.department.name}`}
                        </p>
                      </td>
                      <td className="py-2.5 px-3">
                        <p className="font-semibold text-gray-900 text-xs">{r.section}</p>
                        <p className="text-[11px] text-gray-500">{r.investmentType}</p>
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-700 tabular-nums">{inr(r.declaredAmount)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-700 tabular-nums">{inr(r.proofAmount)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                        {r.approvedAmount != null ? (
                          <span className="text-emerald-700">{inr(r.approvedAmount)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {r.fileUrl ? (
                          <a href={r.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline">
                            <FileText size={11} /> View
                          </a>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">none</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center"><StatusBadge status={r.status} /></td>
                      <td className="py-2.5 px-3 text-right">
                        {isOpenReview ? (
                          <button
                            onClick={() => setReviewing(null)}
                            className="text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1"
                          >Cancel</button>
                        ) : r.status === "Approved" || r.status === "Rejected" ? (
                          <button
                            onClick={() => setReviewing(r.id)}
                            className="text-xs text-green-700 hover:underline px-2.5 py-1"
                          >Re-review</button>
                        ) : (
                          <button
                            onClick={() => setReviewing(r.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-normal"
                          >
                            Review
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpenReview && (
                      <tr className="bg-green-50/30">
                        <td colSpan={8} className="px-6 py-3">
                          <ReviewForm
                            row={r}
                            busy={reviewMut.isPending}
                            onSubmit={(body) => reviewMut.mutate({ id: r.id, body })}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: POIStatus }) {
  const cls =
    status === "Approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    status === "PartiallyApproved" ? "bg-amber-50 text-amber-700 border-amber-200" :
    status === "Rejected" ? "bg-rose-50 text-rose-700 border-rose-200" :
    status === "UnderReview" ? "bg-green-50 text-green-700 border-green-200" :
    "bg-gray-100 text-gray-600 border-gray-200";
  const label =
    status === "PartiallyApproved" ? "Partial" :
    status === "UnderReview" ? "Reviewing" :
    status;
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border", cls)}>
      {label}
    </span>
  );
}

/**
 * Inline review form. Default action: approve full proofAmount. Admin can
 * change the amount (partial) or switch to reject + supply a reason.
 */
function ReviewForm({
  row, busy, onSubmit,
}: {
  row: InvestmentProofRow;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const defaultAmount = Number(row.proofAmount) || Number(row.declaredAmount) || 0;
  const [amount, setAmount] = useState<number | null>(
    row.approvedAmount != null ? Number(row.approvedAmount) : defaultAmount,
  );
  const [reason, setReason] = useState<string>(row.rejectionReason ?? "");

  const approveFull = () => onSubmit({ approvedAmount: defaultAmount, status: "Approved" });
  const approvePartial = () => {
    if (amount == null || amount <= 0) return alert("Enter an amount to approve");
    const status: POIStatus = amount >= defaultAmount ? "Approved" : "PartiallyApproved";
    onSubmit({ approvedAmount: amount, status });
  };
  const reject = () => {
    if (!reason.trim()) return alert("Enter a rejection reason");
    onSubmit({ approvedAmount: 0, status: "Rejected", rejectionReason: reason.trim() });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
      {/* Approve full */}
      <div className="rounded border border-emerald-200 bg-white p-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 mb-1">Approve full</p>
        <p className="text-gray-600 mb-2">Approves the entire proof amount: <b>{inr(defaultAmount)}</b></p>
        <button
          onClick={approveFull}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded font-medium"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Approve {inr(defaultAmount)}
        </button>
      </div>

      {/* Partial */}
      <div className="rounded border border-amber-200 bg-white p-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1">Approve partial</p>
        <NumberInput
          value={amount}
          onChange={setAmount}
          className="w-full px-2 py-1 border border-amber-300 rounded text-right mb-2"
        />
        <button
          onClick={approvePartial}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded font-medium"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Approve custom
        </button>
      </div>

      {/* Reject */}
      <div className="rounded border border-rose-200 bg-white p-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 mb-1">Reject</p>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (shown to employee)"
          className="w-full px-2 py-1 border border-rose-300 rounded mb-2"
        />
        <button
          onClick={reject}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded font-medium"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
          Reject
        </button>
      </div>
    </div>
  );
}
