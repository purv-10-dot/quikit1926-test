"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { IndianRupee, Plus, Banknote, Check, X, Send, Lock, Coins, Pause, Play, Eraser } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { Pagination } from "@/components/hrms/pagination";

type LoanStatus = "Pending" | "Approved" | "Disbursed" | "OnHold" | "Closed" | "Rejected" | "WrittenOff";
type LoanType = "Personal" | "Education" | "Medical" | "Housing" | "Vehicle" | "Advance" | "Other";

interface Loan {
  id: string;
  employeeId: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; department: { name: string } | null } | null;
  loanType: LoanType;
  principalAmount: string | number;
  interestRate: string | number;
  tenureMonths: number;
  emiAmount: string | number;
  disbursementDate: string | null;
  startDate: string | null;
  outstandingAmount: string | number;
  emisPaid: number;
  status: LoanStatus;
  reason: string | null;
  holdUntil: string | null;
  _count: { repayments: number };
}

interface EmpRow {
  employeeId: string; employeeCode: string; name: string;
  department: string | null; designation: string | null;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
type StatusFilter = "All" | LoanStatus;
const STATUSES: StatusFilter[] = ["All", "Pending", "Approved", "Disbursed", "Closed", "Rejected"];
const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md";

function statusCls(s: LoanStatus) {
  switch (s) {
    case "Pending": return "bg-amber-100 text-amber-700";
    case "Approved": return "bg-[#dcfce7] text-[#16a34a]";
    case "Disbursed": return "bg-emerald-100 text-emerald-700";
    case "Closed": return "bg-gray-100 text-gray-600";
    case "Rejected": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

export default function LoansPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("All");
  const [newOpen, setNewOpen] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "loans", status],
    queryFn: () => api.get<Loan[]>(`/api/v1/hrms/payroll/loans${status === "All" ? "" : `?status=${status}`}`),
  });

  const rows = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageItems = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [disburseTarget, setDisburseTarget] = useState<string | null>(null);
  const [disburseDate, setDisburseDate] = useState("");
  const [closeTarget, setCloseTarget] = useState<string | null>(null);
  const [prepayTarget, setPrepayTarget] = useState<Loan | null>(null);
  const [waiveTarget, setWaiveTarget] = useState<Loan | null>(null);
  const [holdTarget, setHoldTarget] = useState<Loan | null>(null);

  const isPaused = (r: Loan) => !!r.holdUntil && new Date(r.holdUntil) > new Date();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["payroll", "loans"] });

  const approveMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/hrms/payroll/loans/${id}/approve`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll", "loans"] }),
  });
  const disburseMut = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) =>
      api.post(`/api/v1/hrms/payroll/loans/${id}/disburse`, { disbursementDate: date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll", "loans"] }),
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/api/v1/hrms/payroll/loans/${id}/reject`, { rejectionReason: reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll", "loans"] }),
  });
  const closeMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/hrms/payroll/loans/${id}/close`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll", "loans"] }),
  });
  const prepayMut = useMutation({
    mutationFn: ({ id, amount, note }: { id: string; amount: number; note?: string }) =>
      api.post(`/api/v1/hrms/payroll/loans/${id}/prepay`, { amount, note }),
    onSuccess: invalidate,
  });
  const waiveMut = useMutation({
    mutationFn: ({ id, emiCount, note }: { id: string; emiCount: number; note?: string }) =>
      api.post(`/api/v1/hrms/payroll/loans/${id}/waive`, { emiCount, note }),
    onSuccess: invalidate,
  });
  const holdMut = useMutation({
    mutationFn: ({ id, months, note }: { id: string; months: number; note?: string }) =>
      api.post(`/api/v1/hrms/payroll/loans/${id}/hold`, { months, note }),
    onSuccess: invalidate,
  });
  const resumeMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/hrms/payroll/loans/${id}/resume`, {}),
    onSuccess: invalidate,
  });

  return (
    <div className="w-full px-5 py-4 space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <Banknote size={28} className="text-[#22c55e] mt-1.5" />
          <div>
            <h1 className="text-page-title text-gray-900 leading-tight">Loans</h1>
            <p className="text-xs text-gray-500 mt-1">Employee loans and advances. EMIs auto-deduct in pay runs.</p>
          </div>
        </div>
        <button onClick={() => setNewOpen(true)} className="btn btn-primary">
          <Plus size={13} /> New loan
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex gap-2 px-4 py-3 border-b border-gray-100">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={clsx(
                "px-3 py-1 text-xs rounded-full border transition",
                status === s ? "bg-green-600 text-white border-[#22c55e]" : "bg-white text-gray-600 border-gray-300 hover:border-[#86efac]",
              )}
            >{s}</button>
          ))}
        </div>

        {isLoading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-xs text-gray-500">{status === "All" ? "No loans yet." : `No ${status.toLowerCase()} loans.`}</div>
        ) : (
          <>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-left py-2 px-3">Type</th>
                <th className="text-right py-2 px-3">Principal</th>
                <th className="text-right py-2 px-3">EMI</th>
                <th className="text-right py-2 px-3">Tenure</th>
                <th className="text-right py-2 px-3">Outstanding</th>
                <th className="text-right py-2 px-3">EMIs</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="w-40" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r, i) => (
                <tr key={r.id} className="row-stagger border-b border-gray-50 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="py-3 px-3">
                    <p className="text-[13px] font-medium text-gray-900">{r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "Unknown"}</p>
                    <p className="text-xs text-gray-500">{r.employee?.employeeCode}</p>
                  </td>
                  <td className="py-3 px-3 text-gray-700">{r.loanType}</td>
                  <td className="py-3 px-3 text-right text-sm text-gray-900">₹{INR.format(Number(r.principalAmount))}</td>
                  <td className="py-3 px-3 text-right text-sm text-gray-900">₹{INR.format(Number(r.emiAmount))}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{r.tenureMonths}m</td>
                  <td className="py-3 px-3 text-right text-sm text-gray-900 font-semibold">₹{INR.format(Number(r.outstandingAmount))}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{r.emisPaid}/{r.tenureMonths}</td>
                  <td className="py-3 px-3">
                    <span className={clsx("text-[11px] font-medium px-2 py-0.5 rounded", statusCls(r.status))}>{r.status}</span>
                    {isPaused(r) && (
                      <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 whitespace-nowrap">
                        Paused → {new Date(r.holdUntil!).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {r.status === "Pending" && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => approveMut.mutate(r.id)} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded"><Check size={12} /></button>
                        <button onClick={() => { setRejectTarget(r.id); setRejectReason(""); }} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"><X size={12} /></button>
                      </div>
                    )}
                    {r.status === "Approved" && (
                      <button onClick={() => { setDisburseTarget(r.id); setDisburseDate(new Date().toISOString().slice(0, 10)); }} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded">
                        <Send size={12} /> Disburse
                      </button>
                    )}
                    {r.status === "Disbursed" && Number(r.outstandingAmount) > 0 && (
                      <div className="flex gap-1 justify-end">
                        <button title="Prepay (lump sum)" onClick={() => setPrepayTarget(r)} className="inline-flex items-center px-1.5 py-1 text-xs border border-[var(--border)] hover:bg-emerald-50 text-emerald-700 rounded"><Coins size={12} /></button>
                        <button title="Waive EMIs" onClick={() => setWaiveTarget(r)} className="inline-flex items-center px-1.5 py-1 text-xs border border-[var(--border)] hover:bg-amber-50 text-amber-700 rounded"><Eraser size={12} /></button>
                        {isPaused(r) ? (
                          <button title="Resume EMIs" disabled={resumeMut.isPending} onClick={() => resumeMut.mutate(r.id)} className="inline-flex items-center px-1.5 py-1 text-xs border border-[var(--border)] hover:bg-green-50 text-green-700 rounded disabled:opacity-50"><Play size={12} /></button>
                        ) : (
                          <button title="Pause EMIs" onClick={() => setHoldTarget(r)} className="inline-flex items-center px-1.5 py-1 text-xs border border-[var(--border)] hover:bg-orange-50 text-orange-700 rounded"><Pause size={12} /></button>
                        )}
                        <button title="Close / write off" onClick={() => setCloseTarget(r.id)} className="inline-flex items-center px-1.5 py-1 text-xs border border-[var(--border)] hover:bg-gray-50 text-gray-700 rounded"><Lock size={12} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={rows.length} limit={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </div>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New Loan" size="md">
        <NewLoanForm onCancel={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); qc.invalidateQueries({ queryKey: ["payroll", "loans"] }); }} />
      </Modal>

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject Loan" size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (rejectTarget && rejectReason.trim()) {
              rejectMut.mutate({ id: rejectTarget, reason: rejectReason.trim() });
              setRejectTarget(null);
            }
          }}
          className="p-4 space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Rejection reason <span className="text-red-500">*</span></label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              autoFocus
              required
              placeholder="Explain why this loan is being rejected..."
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setRejectTarget(null)} className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={!rejectReason.trim() || rejectMut.isPending} className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">
              {rejectMut.isPending ? "Rejecting..." : "Reject Loan"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!disburseTarget} onClose={() => setDisburseTarget(null)} title="Disburse Loan" size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (disburseTarget && disburseDate) {
              disburseMut.mutate({ id: disburseTarget, date: disburseDate });
              setDisburseTarget(null);
            }
          }}
          className="p-4 space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Disbursement date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={disburseDate}
              onChange={(e) => setDisburseDate(e.target.value)}
              autoFocus
              required
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
            <p className="mt-1 text-xs text-gray-500">Date the loan amount is credited to employee.</p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setDisburseTarget(null)} className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={!disburseDate || disburseMut.isPending} className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">
              {disburseMut.isPending ? "Disbursing..." : "Disburse"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!closeTarget} onClose={() => setCloseTarget(null)} title="Close Loan" size="md">
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-700">
            Close this loan now? Remaining outstanding balance will be written off. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setCloseTarget(null)} className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] rounded-md hover:bg-gray-50">Cancel</button>
            <button
              type="button"
              disabled={closeMut.isPending}
              onClick={() => {
                if (closeTarget) {
                  closeMut.mutate(closeTarget);
                  setCloseTarget(null);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {closeMut.isPending ? "Closing..." : "Close Loan"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!prepayTarget} onClose={() => setPrepayTarget(null)} title="Prepay Loan" size="md">
        {prepayTarget && (
          <PrepayForm
            loan={prepayTarget}
            isPending={prepayMut.isPending}
            onCancel={() => setPrepayTarget(null)}
            onSubmit={(amount, note) => prepayMut.mutate({ id: prepayTarget.id, amount, note }, { onSuccess: () => setPrepayTarget(null) })}
          />
        )}
      </Modal>

      <Modal open={!!waiveTarget} onClose={() => setWaiveTarget(null)} title="Waive EMIs" size="md">
        {waiveTarget && (
          <WaiveForm
            loan={waiveTarget}
            isPending={waiveMut.isPending}
            onCancel={() => setWaiveTarget(null)}
            onSubmit={(emiCount, note) => waiveMut.mutate({ id: waiveTarget.id, emiCount, note }, { onSuccess: () => setWaiveTarget(null) })}
          />
        )}
      </Modal>

      <Modal open={!!holdTarget} onClose={() => setHoldTarget(null)} title="Pause EMIs" size="md">
        {holdTarget && (
          <HoldForm
            isPending={holdMut.isPending}
            onCancel={() => setHoldTarget(null)}
            onSubmit={(months, note) => holdMut.mutate({ id: holdTarget.id, months, note }, { onSuccess: () => setHoldTarget(null) })}
          />
        )}
      </Modal>
    </div>
  );
}

function PrepayForm({ loan, isPending, onCancel, onSubmit }: { loan: Loan; isPending: boolean; onCancel: () => void; onSubmit: (amount: number, note?: string) => void }) {
  const outstanding = Number(loan.outstandingAmount);
  const [amount, setAmount] = useState<number | null>(outstanding);
  const [note, setNote] = useState("");
  const err = !amount || amount <= 0 ? "Enter an amount" : amount > outstanding ? "Amount exceeds outstanding balance" : null;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!err && amount) onSubmit(amount, note.trim() || undefined); }} className="p-4 space-y-3">
      <p className="text-xs text-gray-600">Outstanding balance: <span className="font-semibold text-gray-900">₹{INR.format(outstanding)}</span></p>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Amount to pay (₹) <span className="text-red-500">*</span></label>
        <NumberInput value={amount} onChange={setAmount} required className={inputCls} />
        <button type="button" onClick={() => setAmount(outstanding)} className="mt-1 text-[11px] text-[#16a34a] hover:underline">Pay full balance (₹{INR.format(outstanding)})</button>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Note</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cheque ref / payment mode" className={inputCls} />
      </div>
      {amount && amount >= outstanding && !err && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-3 py-2">This clears the loan — it will be marked Closed.</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] rounded-md hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={!!err || isPending} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50">
          {isPending ? "Processing..." : "Record Prepayment"}
        </button>
      </div>
    </form>
  );
}

function WaiveForm({ loan, isPending, onCancel, onSubmit }: { loan: Loan; isPending: boolean; onCancel: () => void; onSubmit: (emiCount: number, note?: string) => void }) {
  const outstanding = Number(loan.outstandingAmount);
  const emi = Number(loan.emiAmount);
  const [emiCount, setEmiCount] = useState(1);
  const [note, setNote] = useState("");
  const waiveAmount = Math.min(outstanding, emi * emiCount);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(emiCount, note.trim() || undefined); }} className="p-4 space-y-3">
      <p className="text-xs text-gray-600">EMI: <span className="font-semibold text-gray-900">₹{INR.format(emi)}</span> · Outstanding: <span className="font-semibold text-gray-900">₹{INR.format(outstanding)}</span></p>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">EMIs to waive</label>
        <Select value={String(emiCount)} onChange={(v) => setEmiCount(Number(v))} options={[1, 2, 3].map((n) => ({ value: String(n), label: `${n} EMI${n > 1 ? "s" : ""}` }))} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for waiver" className={inputCls} />
      </div>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2">
        Writes off ₹{INR.format(waiveAmount)} from the balance.{waiveAmount >= outstanding ? " This clears the loan — it will be Closed." : ""}
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] rounded-md hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={isPending} className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50">
          {isPending ? "Processing..." : "Waive EMIs"}
        </button>
      </div>
    </form>
  );
}

function HoldForm({ isPending, onCancel, onSubmit }: { isPending: boolean; onCancel: () => void; onSubmit: (months: number, note?: string) => void }) {
  const [months, setMonths] = useState(1);
  const [note, setNote] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(months, note.trim() || undefined); }} className="p-4 space-y-3">
      <p className="text-xs text-gray-600">Pause EMI auto-deduction. The loan resumes automatically afterwards and the end date is pushed out accordingly.</p>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Pause for</label>
        <Select value={String(months)} onChange={(v) => setMonths(Number(v))} options={[1, 2, 3].map((n) => ({ value: String(n), label: `${n} month${n > 1 ? "s" : ""}` }))} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for pause" className={inputCls} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] rounded-md hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={isPending} className="px-3 py-1.5 text-xs font-medium bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50">
          {isPending ? "Pausing..." : "Pause EMIs"}
        </button>
      </div>
    </form>
  );
}

function NewLoanForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const api = useApiClient();
  const [err, setErr] = useState<string | null>(null);
  const { data: empRes } = useQuery({
    queryKey: ["payroll", "employee-salaries"],
    queryFn: () => api.get<EmpRow[]>("/api/v1/hrms/payroll/employee-salaries"),
  });
  const employees = empRes?.data ?? [];

  const [form, setForm] = useState<{
    employeeId: string; loanType: LoanType; principalAmount: number | null; interestRate: number | null;
    tenureMonths: number | null; emiAmount: number | null; startDate: string; reason: string;
  }>({
    employeeId: "",
    loanType: "Personal",
    principalAmount: null,
    interestRate: null,
    tenureMonths: null,
    emiAmount: null,
    startDate: new Date().toISOString().slice(0, 10),
    reason: "",
  });

  // Auto EMI calc (simple interest: P * (1 + r*t/12) / t)
  const autoEMI = () => {
    if (!form.principalAmount || !form.tenureMonths) return 0;
    const r = (form.interestRate ?? 0) / 100;
    const t = form.tenureMonths / 12;
    const totalPayable = form.principalAmount * (1 + r * t);
    return Math.round(totalPayable / form.tenureMonths);
  };

  const mut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/payroll/loans", body),
    onSuccess: onCreated,
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!form.employeeId) return setErr("Select employee");
      if (!form.principalAmount || form.principalAmount <= 0) return setErr("Enter principal");
      if (!form.tenureMonths || form.tenureMonths <= 0) return setErr("Enter tenure in months");
      const emi = form.emiAmount || autoEMI();
      if (emi <= 0) return setErr("EMI must be positive");
      if (emi > form.principalAmount) return setErr("EMI can’t exceed the loan principal");
      if (emi * form.tenureMonths < form.principalAmount) return setErr("EMI × tenure must be at least the principal — increase EMI or tenure");
      mut.mutate({
        ...form,
        emiAmount: emi,
      });
    }} className="p-4 space-y-3">
      <EmployeeSelect
        label="Employee"
        required
        value={form.employeeId}
        onChange={(id) => setForm({ ...form, employeeId: id })}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Loan Type</label>
          <Select
            value={form.loanType}
            onChange={(v) => setForm({ ...form, loanType: v as LoanType })}
            options={(["Personal", "Education", "Medical", "Housing", "Vehicle", "Advance", "Other"] as const).map((t) => ({ value: t, label: t }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Interest Rate % p.a.</label>
          <NumberInput step="0.01" value={form.interestRate} onChange={(v) => setForm({ ...form, interestRate: v })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Principal (₹) <span className="text-red-500">*</span></label>
          <NumberInput value={form.principalAmount} onChange={(v) => setForm({ ...form, principalAmount: v })} required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tenure (months)</label>
          <NumberInput allowDecimal={false} value={form.tenureMonths} onChange={(v) => setForm({ ...form, tenureMonths: v })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">EMI Amount (₹)</label>
          <NumberInput value={form.emiAmount ?? autoEMI() ?? null} onChange={(v) => setForm({ ...form, emiAmount: v })} className={inputCls} />
          <p className="text-[11px] text-gray-500 mt-1">Auto: ₹{INR.format(autoEMI())}/month</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
          <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputCls} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
        <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputCls} />
      </div>
      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{err}</p>}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium">Cancel</button>
        <button type="submit" disabled={mut.isPending} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm">
          {mut.isPending ? "Creating..." : "Submit"}
        </button>
      </div>
    </form>
  );
}
