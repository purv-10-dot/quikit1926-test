"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { Database, Inbox, ChevronDown, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

interface PriorPayrollRecord {
  id: string;
  employeeId: string;
  financialYear: string;
  periodStart: string;
  periodEnd: string;
  grossEarnings: string;
  totalDeductions: string;
  netPay: string;
  epfEmployee: string;
  epfEmployer: string;
  esiEmployee: string;
  esiEmployer: string;
  professionalTax: string;
  tds: string;
  notes: string | null;
  createdAt: string;
}

interface EmployeeLite {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr = (v: string | number) => `₹${INR.format(Math.round(Number(v ?? 0)))}`;

function currentFY(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 4 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  if (sameMonth) {
    return s.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  }
  return `${s.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} → ${e.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
}

export function PriorPayrollRecords() {
  const api = useApiClient();
  const [fy, setFy] = useState(currentFY());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: recData, isLoading } = useQuery({
    queryKey: ["payroll", "prior-payroll-records", fy],
    queryFn: () => api.get<PriorPayrollRecord[]>(`/api/v1/hrms/payroll/prior-payroll/records?fy=${encodeURIComponent(fy)}`),
  });
  const records = recData?.data ?? [];

  // Reuse the same employee fetch the upload widget does — react-query will
  // dedupe via the cache key, so this doesn't double-fetch.
  const { data: empData } = useQuery({
    queryKey: ["employees", "lite-for-prior-payroll"],
    queryFn: () => api.get<EmployeeLite[]>("/api/v1/hrms/employees?limit=500"),
  });
  const empById = useMemo(() => {
    const m = new Map<string, EmployeeLite>();
    for (const e of empData?.data ?? []) m.set(e.id, e);
    return m;
  }, [empData]);

  // Group records by employee for a clean per-person summary.
  const grouped = useMemo(() => {
    const map = new Map<string, PriorPayrollRecord[]>();
    for (const r of records) {
      const list = map.get(r.employeeId) ?? [];
      list.push(r);
      map.set(r.employeeId, list);
    }
    return Array.from(map.entries()).map(([employeeId, rows]) => {
      const emp = empById.get(employeeId) ?? null;
      const totalGross = rows.reduce((s, r) => s + Number(r.grossEarnings), 0);
      const totalTds   = rows.reduce((s, r) => s + Number(r.tds), 0);
      const totalNet   = rows.reduce((s, r) => s + Number(r.netPay), 0);
      const sortedRows = [...rows].sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime());
      return { employeeId, emp, rows: sortedRows, totalGross, totalTds, totalNet };
    }).sort((a, b) => {
      const an = a.emp ? `${a.emp.firstName} ${a.emp.lastName}` : a.employeeId;
      const bn = b.emp ? `${b.emp.firstName} ${b.emp.lastName}` : b.employeeId;
      return an.localeCompare(bn);
    });
  }, [records, empById]);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalRecords = records.length;
  const totalGross = records.reduce((s, r) => s + Number(r.grossEarnings), 0);
  const totalTds   = records.reduce((s, r) => s + Number(r.tds), 0);

  return (
    <div className="rounded-md border border-gray-200 bg-white p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <Database size={15} className="text-blue-600" />
            Saved YTD records
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {isLoading
              ? "Loading…"
              : totalRecords === 0
                ? "No records yet for this FY."
                : `${totalRecords} record${totalRecords > 1 ? "s" : ""} across ${grouped.length} employee${grouped.length > 1 ? "s" : ""}. These feed into TDS and Form 16 once wired.`}
          </p>
        </div>
        <Select
          value={fy}
          onChange={setFy}
          options={Array.from({ length: 5 }, (_, i) => {
            const y = new Date().getFullYear() - i;
            const label = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
            return { value: label, label: `FY ${label}` };
          })}
          className="w-32"
        />
      </div>

      {totalRecords > 0 && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <KPI label="Records" value={String(totalRecords)} />
          <KPI label="Gross (FY total)" value={inr(totalGross)} />
          <KPI label="TDS (FY total)" value={inr(totalTds)} />
        </div>
      )}

      {isLoading ? null : totalRecords === 0 ? (
        <div className="rounded border border-dashed border-gray-200 bg-gray-50 py-10 text-center">
          <Inbox size={24} className="mx-auto text-gray-300" />
          <p className="text-xs text-gray-600 mt-1">
            No records uploaded for FY {fy}. Use the upload widget above to add them.
          </p>
        </div>
      ) : (
        <div className="rounded border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-1.5 px-2 font-semibold text-gray-600 w-8" />
                <th className="text-left py-1.5 px-2 font-semibold text-gray-600">Employee</th>
                <th className="text-right py-1.5 px-2 font-semibold text-gray-600">Months</th>
                <th className="text-right py-1.5 px-2 font-semibold text-gray-600">Gross</th>
                <th className="text-right py-1.5 px-2 font-semibold text-gray-600">TDS</th>
                <th className="text-right py-1.5 px-2 font-semibold text-gray-600">Net</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => {
                const isOpen = expanded.has(g.employeeId);
                return (
                  <Fragment key={g.employeeId}>
                    <tr
                      onClick={() => toggle(g.employeeId)}
                      className="border-t border-gray-100 cursor-pointer hover:bg-gray-50/60"
                    >
                      <td className="py-1.5 px-2 text-gray-400">
                        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </td>
                      <td className="py-1.5 px-2">
                        <p className="font-medium text-gray-900">
                          {g.emp ? `${g.emp.firstName} ${g.emp.lastName}` : <span className="text-rose-600">Unknown employee</span>}
                        </p>
                        <p className="text-[10px] text-gray-500">{g.emp?.employeeCode ?? g.employeeId}</p>
                      </td>
                      <td className="py-1.5 px-2 text-right text-gray-700 tabular-nums">{g.rows.length}</td>
                      <td className="py-1.5 px-2 text-right text-gray-900 font-semibold tabular-nums">{inr(g.totalGross)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-700 tabular-nums">{inr(g.totalTds)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-900 font-semibold tabular-nums">{inr(g.totalNet)}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50/40">
                        <td colSpan={6} className="px-4 py-2">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left py-1">Period</th>
                                <th className="text-right py-1">Gross</th>
                                <th className="text-right py-1">EPF (Emp)</th>
                                <th className="text-right py-1">PT</th>
                                <th className="text-right py-1">TDS</th>
                                <th className="text-right py-1">Net</th>
                                <th className="text-left py-1 pl-2">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.rows.map((r) => (
                                <tr key={r.id} className="border-t border-gray-200">
                                  <td className="py-1 text-gray-700">{formatPeriod(r.periodStart, r.periodEnd)}</td>
                                  <td className="py-1 text-right text-gray-900 tabular-nums">{inr(r.grossEarnings)}</td>
                                  <td className="py-1 text-right text-gray-700 tabular-nums">{inr(r.epfEmployee)}</td>
                                  <td className="py-1 text-right text-gray-700 tabular-nums">{inr(r.professionalTax)}</td>
                                  <td className="py-1 text-right text-gray-700 tabular-nums">{inr(r.tds)}</td>
                                  <td className="py-1 text-right text-gray-900 tabular-nums">{inr(r.netPay)}</td>
                                  <td className="py-1 pl-2 text-gray-500 italic truncate max-w-[200px]" title={r.notes ?? ""}>
                                    {r.notes ?? ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className={clsx("rounded border border-gray-200 bg-gradient-to-b from-gray-50/40 to-white px-3 py-2")}>
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-gray-900 mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}
