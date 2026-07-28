"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Heart, Plus, Check, X, AlertCircle, Info } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { Pagination } from "@/components/hrms/pagination";

type Status = "Draft" | "Submitted" | "Verified" | "Rejected";

interface Donation {
  id: string;
  employeeId: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; department: { name: string } | null } | null;
  financialYear: string;
  donorPAN: string | null;
  doneeName: string;
  doneePAN: string | null;
  section: string;
  donationDate: string;
  amount: string | number;
  exemptionPercent: string | number;
  qualifyingLimit: string | number | null;
  exemptAmount: string | number | null;
  receiptNumber: string | null;
  fileUrl: string | null;
  status: Status;
  rejectionReason: string | null;
}

interface EmpRow {
  employeeId: string; employeeCode: string; name: string;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const STATUSES: Status[] = ["Submitted", "Verified", "Rejected"];
const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md";

function currentFY(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 4 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

function statusCls(s: Status) {
  switch (s) {
    case "Submitted": return "bg-amber-100 text-amber-700";
    case "Verified": return "bg-emerald-100 text-emerald-700";
    case "Rejected": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

export default function GivingPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [fy, setFy] = useState(currentFY());
  const [status, setStatus] = useState<Status>("Submitted");
  const [newOpen, setNewOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "giving", fy, status],
    queryFn: () => api.get<Donation[]>(`/api/v1/hrms/payroll/giving?fy=${fy}&status=${status}`),
  });

  const rows = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageItems = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const verifyMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.post(`/api/v1/hrms/payroll/giving/${id}/verify`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll", "giving"] }),
  });

  const totalExempt = rows.filter((r) => r.status === "Verified").reduce((s, r) => s + Number(r.exemptAmount ?? 0), 0);

  return (
    <div className="w-full px-5 py-4 space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <Heart size={28} className="text-[#22c55e] mt-1.5" />
          <div>
            <h1 className="text-page-title text-gray-900 leading-tight">Giving</h1>
            <p className="text-xs text-gray-500 mt-1">Section 80G donations — tax deductions on charitable contributions.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={fy}
            onChange={(v) => { setFy(v); setPage(1); }}
            options={Array.from({ length: 5 }, (_, i) => {
              const y = new Date().getFullYear() - i;
              const label = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
              return { value: label, label: `FY ${label}` };
            })}
            className="w-36"
          />
          <button
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium shadow-sm"
          >
            <Plus size={13} /> Record Donation
          </button>
        </div>
      </div>

      <div className="rounded-md border border-[#dcfce7] bg-[#dcfce7] px-4 py-3 text-xs text-[#15803d] flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Section 80G</p>
          <p className="mt-1">
            Donations to eligible charitable institutions qualify for deduction under Section 80G. Eligibility types:
            {" "}<strong>100% w/o limit</strong> (e.g. PM National Relief Fund),{" "}
            <strong>50% w/o limit</strong>,{" "}
            <strong>100% with qualifying limit (10% of adjusted gross total income)</strong>,{" "}
            <strong>50% with qualifying limit</strong>. Donor PAN + Donee PAN mandatory for claim.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex gap-2">
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
          <div className="text-xs text-gray-600">
            Verified exempt total (FY {fy}): <span className="font-semibold text-gray-900">₹{INR.format(totalExempt)}</span>
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-xs text-gray-500">No {status.toLowerCase()} donations for FY {fy}.</div>
        ) : (
          <>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-left py-2 px-3">Donee</th>
                <th className="text-left py-2 px-3">Date</th>
                <th className="text-right py-2 px-3">Amount</th>
                <th className="text-right py-2 px-3">Exempt %</th>
                <th className="text-right py-2 px-3">Exempt ₹</th>
                <th className="text-left py-2 px-3">Receipt</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r, i) => (
                <tr key={r.id} className="row-stagger border-b border-gray-50 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="py-3 px-3">
                    <p className="text-[13px] font-medium text-gray-900">{r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "Unknown"}</p>
                    <p className="text-xs text-gray-500">{r.employee?.employeeCode} · PAN {r.donorPAN ?? "—"}</p>
                  </td>
                  <td className="py-3 px-3">
                    <p className="text-gray-900">{r.doneeName}</p>
                    <p className="text-xs text-gray-500">PAN {r.doneePAN ?? "—"}</p>
                  </td>
                  <td className="py-3 px-3 text-gray-700">{new Date(r.donationDate).toLocaleDateString("en-IN")}</td>
                  <td className="py-3 px-3 text-right text-sm text-gray-900">₹{INR.format(Number(r.amount))}</td>
                  <td className="py-3 px-3 text-right text-gray-700">{Number(r.exemptionPercent)}%</td>
                  <td className="py-3 px-3 text-right text-sm text-gray-900 font-semibold">
                    {r.exemptAmount != null ? `₹${INR.format(Number(r.exemptAmount))}` : "—"}
                  </td>
                  <td className="py-3 px-3 text-xs text-gray-600">{r.receiptNumber ?? "—"}</td>
                  <td className="py-3 px-3">
                    <span className={clsx("text-[11px] font-medium px-2 py-0.5 rounded", statusCls(r.status))}>{r.status}</span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    {r.status === "Submitted" && (
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => verifyMut.mutate({ id: r.id, body: { status: "Verified" } })}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded"
                        ><Check size={12} /></button>
                        <button
                          onClick={() => { setRejectTarget(r.id); setRejectReason(""); }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                        ><X size={12} /></button>
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

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Record Donation" size="md">
        <NewDonationForm
          defaultFY={fy}
          onCancel={() => setNewOpen(false)}
          onCreated={() => { setNewOpen(false); qc.invalidateQueries({ queryKey: ["payroll", "giving"] }); }}
        />
      </Modal>

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject Donation" size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (rejectTarget && rejectReason.trim()) {
              verifyMut.mutate({ id: rejectTarget, body: { status: "Rejected", rejectionReason: rejectReason.trim() } });
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
              placeholder="Explain why this donation is being rejected..."
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setRejectTarget(null)} className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] rounded-md hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={!rejectReason.trim() || verifyMut.isPending} className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">
              {verifyMut.isPending ? "Rejecting..." : "Reject"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function NewDonationForm({ defaultFY, onCancel, onCreated }: { defaultFY: string; onCancel: () => void; onCreated: () => void }) {
  const api = useApiClient();
  const [err, setErr] = useState<string | null>(null);

  const { data: empRes } = useQuery({
    queryKey: ["payroll", "employee-salaries"],
    queryFn: () => api.get<EmpRow[]>("/api/v1/hrms/payroll/employee-salaries"),
  });
  const employees = empRes?.data ?? [];

  const [form, setForm] = useState<{
    employeeId: string; financialYear: string; donorPAN: string; doneeName: string; doneePAN: string;
    section: string; donationDate: string; amount: number | null; exemptionPercent: number;
    qualifyingLimit: number | null; receiptNumber: string; fileUrl: string; notes: string;
  }>({
    employeeId: "",
    financialYear: defaultFY,
    donorPAN: "",
    doneeName: "",
    doneePAN: "",
    section: "80G",
    donationDate: new Date().toISOString().slice(0, 10),
    amount: null,
    exemptionPercent: 100,
    qualifyingLimit: null,
    receiptNumber: "",
    fileUrl: "",
    notes: "",
  });

  const mut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/payroll/giving", body),
    onSuccess: onCreated,
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!form.employeeId) return setErr("Select employee");
      if (!form.doneeName || !form.amount) return setErr("Donee name and amount required");
      mut.mutate({
        ...form,
        donorPAN: form.donorPAN || null,
        doneePAN: form.doneePAN || null,
        qualifyingLimit: form.qualifyingLimit || null,
        receiptNumber: form.receiptNumber || null,
        fileUrl: form.fileUrl || null,
        notes: form.notes || null,
      });
    }} className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <EmployeeSelect
          label="Employee"
          required
          value={form.employeeId}
          onChange={(id) => setForm({ ...form, employeeId: id })}
        />
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Financial Year</label>
          <Select
            value={form.financialYear}
            onChange={(v) => setForm({ ...form, financialYear: v })}
            options={Array.from({ length: 5 }, (_, i) => {
              const y = new Date().getFullYear() - i;
              const label = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
              return { value: label, label: `FY ${label}` };
            })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Donor PAN</label>
          <input value={form.donorPAN} onChange={(e) => setForm({ ...form, donorPAN: e.target.value.toUpperCase() })} placeholder="AAAAA0000A" maxLength={10} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Section</label>
          <Select
            value={form.section}
            onChange={(v) => setForm({ ...form, section: v })}
            options={[
              { value: "80G", label: "80G (Donations)" },
              { value: "80GGA", label: "80GGA (Scientific research / rural dev)" },
              { value: "80GGC", label: "80GGC (Political party)" },
            ]}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Donee Name <span className="text-red-500">*</span></label>
          <input value={form.doneeName} onChange={(e) => setForm({ ...form, doneeName: e.target.value })} required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Donee PAN</label>
          <input value={form.doneePAN} onChange={(e) => setForm({ ...form, doneePAN: e.target.value.toUpperCase() })} placeholder="AAAAA0000A" maxLength={10} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Receipt Number</label>
          <input value={form.receiptNumber} onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Donation Date</label>
          <input type="date" value={form.donationDate} onChange={(e) => setForm({ ...form, donationDate: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Amount (₹) <span className="text-red-500">*</span></label>
          <NumberInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Exemption %</label>
          <Select
            value={String(form.exemptionPercent)}
            onChange={(v) => setForm({ ...form, exemptionPercent: Number(v.replace(/-ql$/, "")) })}
            options={[
              { value: "100", label: "100% — Without qualifying limit" },
              { value: "50", label: "50% — Without qualifying limit" },
              { value: "100-ql", label: "100% — With qualifying limit (10% of adj. GTI)" },
              { value: "50-ql", label: "50% — With qualifying limit" },
            ]}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Qualifying Limit (₹)</label>
          <NumberInput value={form.qualifyingLimit} onChange={(v) => setForm({ ...form, qualifyingLimit: v })} className={inputCls} />
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
        <AlertCircle size={13} className="mt-0.5 shrink-0" />
        <span>Cash donations above ₹2,000 are not eligible for 80G deduction (Section 80G(5D)). Use cheque/bank transfer/digital payment.</span>
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{err}</p>}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium">Cancel</button>
        <button type="submit" disabled={mut.isPending} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm">
          {mut.isPending ? "Saving..." : "Submit"}
        </button>
      </div>
    </form>
  );
}
