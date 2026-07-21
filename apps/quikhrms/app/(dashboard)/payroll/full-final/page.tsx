"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/ui/select";
import { DoorOpen, Plus, X } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";

type Status = "Draft" | "Computed" | "Approved" | "Paid" | "Cancelled";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  dateOfJoining: string;
}

interface FNF {
  id: string;
  employeeId: string;
  employee: Employee | null;
  resignationDate: string;
  lastWorkingDate: string;
  status: Status;
  pendingSalary: string;
  leaveEncashment: string;
  gratuityAmount: string;
  bonusAmount: string;
  loanRecovery: string;
  netSettlement: string;
  createdAt: string;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const STATUS_BADGE: Record<Status, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Computed: "bg-green-100 text-green-700",
  Approved: "bg-amber-100 text-amber-700",
  Paid: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-red-100 text-red-700",
};

export default function FNFListPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);

  const { data: empRes } = useQuery({
    queryKey: ["fnf", "employees"],
    queryFn: () => api.get<Employee[]>("/api/v1/hrms/employees?limit=500"),
  });
  const employees = empRes?.data ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "full-final"],
    queryFn: () => api.get<FNF[]>("/api/v1/hrms/payroll/full-final"),
  });
  const items = data?.data ?? [];

  const createMut = useMutation({
    mutationFn: (b: Record<string, unknown>) => api.post<FNF>("/api/v1/hrms/payroll/full-final", b),
    onSuccess: () => {
      toast.success("F&F created", "Computed and ready for review.");
      qc.invalidateQueries({ queryKey: ["payroll", "full-final"] });
      setShowForm(false);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DoorOpen className="text-[#22c55e]" />
          <div>
            <h1 className="text-page-title text-gray-900">Final Settlement</h1>
            <p className="text-xs text-gray-500">Compute pending salary, leave encashment, gratuity, bonus, and recoveries on exit.</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium"
        >
          {showForm ? <X size={13} /> : <Plus size={13} />} {showForm ? "Cancel" : "New F&F"}
        </button>
      </div>

      {showForm && (
        <CreateFNFForm
          employees={employees}
          submitting={createMut.isPending}
          onSubmit={(v) => createMut.mutate(v)}
        />
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={6} /></div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500">No settlements yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-left py-2 px-3">LWD</th>
                <th className="text-right py-2 px-3">Pending Salary</th>
                <th className="text-right py-2 px-3">Leave Enc.</th>
                <th className="text-right py-2 px-3">Gratuity</th>
                <th className="text-right py-2 px-3">Net</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {items.map((f, i) => (
                <tr key={f.id} className="row-stagger border-b border-gray-50 hover:bg-gray-50/50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="py-2 px-3">
                    <p className="text-[13px] font-medium text-gray-900">{f.employee ? `${f.employee.firstName} ${f.employee.lastName}` : "—"}</p>
                    <p className="text-xs text-gray-500">{f.employee?.employeeCode}</p>
                  </td>
                  <td className="py-2 px-3 text-gray-700">{new Date(f.lastWorkingDate).toLocaleDateString("en-IN")}</td>
                  <td className="py-2 px-3 text-right text-sm text-gray-900">₹{INR.format(Number(f.pendingSalary))}</td>
                  <td className="py-2 px-3 text-right text-sm text-gray-900">₹{INR.format(Number(f.leaveEncashment))}</td>
                  <td className="py-2 px-3 text-right text-sm text-gray-900">₹{INR.format(Number(f.gratuityAmount))}</td>
                  <td className="py-2 px-3 text-right text-sm text-gray-900 font-bold">₹{INR.format(Number(f.netSettlement))}</td>
                  <td className="py-2 px-3">
                    <span className={clsx("inline-block px-2 py-0.5 rounded text-[11px] font-medium", STATUS_BADGE[f.status])}>
                      {f.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <Link
                      href={`/payroll/full-final/${f.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium shadow-sm transition group"
                    >
                      <DoorOpen size={12} />
                      Open
                      <span className="transition-transform group-hover:translate-x-0.5">→</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CreateFNFForm({ employees, submitting, onSubmit }: {
  employees: Employee[];
  submitting: boolean;
  onSubmit: (v: Record<string, unknown>) => void;
}) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [resignationDate, setResignationDate] = useState(new Date().toISOString().slice(0, 10));
  const [lastWorkingDate, setLastWorkingDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const inputCls = "w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]";

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ employeeId, resignationDate, lastWorkingDate, reason: reason || null }); }}
      className="rounded-md border border-gray-200 bg-white p-4 grid grid-cols-4 gap-3"
    >
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Employee *</label>
        <Select value={employeeId} onChange={setEmployeeId} options={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.employeeCode})` }))} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Resignation Date *</label>
        <input type="date" value={resignationDate} onChange={(e) => setResignationDate(e.target.value)} className={inputCls} required />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Last Working Date *</label>
        <input type="date" value={lastWorkingDate} onChange={(e) => setLastWorkingDate(e.target.value)} className={inputCls} required />
      </div>
      <div className="col-span-4">
        <label className="block text-xs font-semibold text-gray-700 mb-1">Reason</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="Resignation, retirement, termination, etc." />
      </div>
      <div className="col-span-4 flex justify-end">
        <button type="submit" disabled={submitting || !employeeId} className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium">
          {submitting ? "Computing…" : "Compute F&F"}
        </button>
      </div>
    </form>
  );
}
