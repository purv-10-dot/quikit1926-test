"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button, useConfirm } from "@quikit/ui";
import { ArrowLeft, Lock } from "lucide-react";

interface Line { id: string; daysPresent: string | null; hoursWorked: string | null; basicAmount: string; deductions: string; netAmount: string; employee: { empCode: string; firstName: string; lastName: string | null; empType: string } }
interface Run { id: string; runNumber: string; periodStart: string; periodEnd: string; status: string; totalNet: string; totalGross: string; remarks: string | null; lines: Line[] }

export default function PayrollRunDetail() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const confirm = useConfirm();
  const refresh = useCallback(() => { fetch(`/api/hrms/payroll/${id}`).then(r => r.json()).then(j => j.success && setRun(j.data)); }, [id]);
  useEffect(() => { refresh(); }, [refresh]);

  async function finalize() {
    const ok = await confirm({ title: "Finalize payroll?", description: "Locks the run. Lines become immutable.", confirmLabel: "Finalize" });
    if (!ok) return;
    await fetch(`/api/hrms/payroll/${id}/finalize`, { method: "POST" });
    refresh();
  }

  if (!run) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  return (
    <div className="p-6 max-w-5xl">
      <Link href="/hrms/payroll" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Payroll</Link>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{run.runNumber}</h1>
          <div className="text-xs text-gray-500">{new Date(run.periodStart).toISOString().slice(0, 10)} → {new Date(run.periodEnd).toISOString().slice(0, 10)} · Status: <strong>{run.status}</strong></div>
        </div>
        {run.status === "draft" && <Button onClick={finalize}><Lock className="h-3.5 w-3.5 mr-1" /> Finalize</Button>}
      </div>
      {run.remarks && <p className="text-xs text-gray-600 mb-5">{run.remarks}</p>}

      <section className="rounded-lg border border-gray-200 bg-white p-4 mb-5">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><div className="text-xs text-gray-500">Employees</div><div className="font-medium">{run.lines.length}</div></div>
          <div><div className="text-xs text-gray-500">Total Gross</div><div className="font-semibold">₹{run.totalGross}</div></div>
          <div><div className="text-xs text-gray-500">Total Net</div><div className="font-semibold text-green-700">₹{run.totalNet}</div></div>
        </div>
      </section>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent-50 text-xs text-gray-600"><tr>
            <th className="text-left px-3 py-2">Emp</th><th className="text-left px-3 py-2">Type</th>
            <th className="text-right px-3 py-2">Days</th><th className="text-right px-3 py-2">Hours</th>
            <th className="text-right px-3 py-2">Basic</th><th className="text-right px-3 py-2">Deductions</th>
            <th className="text-right px-3 py-2">Net</th>
          </tr></thead>
          <tbody>{run.lines.map(l => (
            <tr key={l.id} className="border-t border-gray-100">
              <td className="px-3 py-2"><div className="font-medium">{l.employee.firstName} {l.employee.lastName ?? ""}</div><div className="font-mono text-[10px] text-gray-500">{l.employee.empCode}</div></td>
              <td className="px-3 py-2 text-xs">{l.employee.empType}</td>
              <td className="px-3 py-2 text-right">{l.daysPresent ?? "—"}</td>
              <td className="px-3 py-2 text-right">{l.hoursWorked ?? "—"}</td>
              <td className="px-3 py-2 text-right">₹{l.basicAmount}</td>
              <td className="px-3 py-2 text-right text-gray-500">₹{l.deductions}</td>
              <td className="px-3 py-2 text-right font-semibold">₹{l.netAmount}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
