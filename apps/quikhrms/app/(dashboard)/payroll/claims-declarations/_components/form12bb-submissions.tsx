"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { ChevronDown, ChevronRight, FileText, Paperclip, Inbox } from "lucide-react";
import { clsx } from "clsx";

interface Form12BBDoc {
  url: string;
  name: string;
  size: number;
  type: string;
  label?: string | null;
  uploadedAt: string;
}

interface Documents {
  hra?: Form12BBDoc[];
  lta?: Form12BBDoc[];
  homeLoan?: Form12BBDoc[];
  chapterVIA?: Form12BBDoc[];
}

interface AdminForm12BBRow {
  id: string;
  financialYear: string;
  hraClaimed: boolean;
  rentPaid: string;
  landlordName: string | null;
  landlordPan: string | null;
  landlordAddress: string | null;
  ltaClaimed: boolean;
  ltaAmount: string;
  homeLoanInterest: string;
  lenderName: string | null;
  lenderType: string | null;
  section80C: string;
  section80CCC: string;
  section80CCD1: string;
  section80D: string;
  section80E: string;
  section80G: string;
  section80TTA: string;
  nps80CCD1B: string;
  signedFileUrl: string | null;
  documents: Documents | null;
  status: "Submitted" | "Verified" | "Rejected";
  declaredAt: string;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string } | null;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr = (v: string | number) => `₹${INR.format(Math.round(Number(v ?? 0)))}`;

function currentFY(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 4 ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}

function chapterTotal(r: AdminForm12BBRow): number {
  return (
    Number(r.section80C) + Number(r.section80CCC) + Number(r.section80CCD1) +
    Number(r.section80D) + Number(r.section80E) + Number(r.section80G) +
    Number(r.section80TTA) + Number(r.nps80CCD1B)
  );
}

function docCount(r: AdminForm12BBRow): number {
  if (!r.documents) return 0;
  const d = r.documents;
  return (
    (d.hra?.length ?? 0) +
    (d.lta?.length ?? 0) +
    (d.homeLoan?.length ?? 0) +
    (d.chapterVIA?.length ?? 0)
  );
}

export function Form12BBSubmissions() {
  const api = useApiClient();
  const [fy, setFy] = useState(currentFY());
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "form12bb-all", fy],
    queryFn: () => api.get<AdminForm12BBRow[]>(`/api/v1/hrms/payroll/form12bb?scope=all&fy=${encodeURIComponent(fy)}`),
  });

  const rows = data?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">All Form 12BB submissions</p>
          <p className="text-xs text-gray-500">
            {isLoading ? "Loading…" : `${rows.length} employees submitted for FY ${fy}`}
          </p>
        </div>
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

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={6} /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center">
            <Inbox size={32} className="mx-auto text-gray-300" />
            <p className="text-sm text-gray-600 mt-2">No submissions yet for FY {fy}</p>
            <p className="text-xs text-gray-500 mt-0.5">Release IT Declaration above to let employees submit.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50/60">
                <th className="w-6" />
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-right py-2 px-3">HRA</th>
                <th className="text-right py-2 px-3">LTA</th>
                <th className="text-right py-2 px-3">Home Loan</th>
                <th className="text-right py-2 px-3">Ch. VI-A</th>
                <th className="text-center py-2 px-3">Docs</th>
                <th className="text-center py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = expanded === r.id;
                const docs = docCount(r);
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      className="border-b border-gray-50 cursor-pointer hover:bg-gray-50/40"
                    >
                      <td className="py-2.5 px-2 text-gray-400">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="py-2.5 px-3">
                        <p className="font-medium text-gray-900">
                          {r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "—"}
                        </p>
                        <p className="text-[11px] text-gray-500">{r.employee?.employeeCode ?? "—"}</p>
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-700 tabular-nums">
                        {r.hraClaimed ? inr(r.rentPaid) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-700 tabular-nums">
                        {r.ltaClaimed ? inr(r.ltaAmount) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-700 tabular-nums">
                        {Number(r.homeLoanInterest) > 0 ? inr(r.homeLoanInterest) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right text-gray-900 font-semibold tabular-nums">
                        {chapterTotal(r) > 0 ? inr(chapterTotal(r)) : <span className="text-gray-300 font-normal">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={clsx(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium",
                          docs > 0 ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500",
                        )}>
                          <Paperclip size={10} /> {docs}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50/50">
                        <td colSpan={8} className="px-6 py-4">
                          <ExpandedDetail row={r} />
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

function StatusBadge({ status }: { status: AdminForm12BBRow["status"] }) {
  const cls =
    status === "Verified" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    status === "Rejected" ? "bg-rose-50 text-rose-700 border-rose-200" :
    "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border", cls)}>
      {status}
    </span>
  );
}

function ExpandedDetail({ row }: { row: AdminForm12BBRow }) {
  const docs = row.documents ?? {};
  const sections: { title: string; items: Form12BBDoc[] }[] = [
    { title: "HRA — Rent agreement & receipts", items: docs.hra ?? [] },
    { title: "LTA — Travel proofs", items: docs.lta ?? [] },
    { title: "Home Loan — Lender certificate", items: docs.homeLoan ?? [] },
    { title: "Chapter VI-A — Investment proofs", items: docs.chapterVIA ?? [] },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Declared amounts */}
      <div className="space-y-1.5">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Declared amounts</h4>
        {row.hraClaimed && (
          <>
            <DetailRow label="HRA — Annual Rent" value={inr(row.rentPaid)} />
            {row.landlordName && <DetailRow label="Landlord" value={`${row.landlordName}${row.landlordPan ? ` · ${row.landlordPan}` : ""}`} />}
          </>
        )}
        {row.ltaClaimed && <DetailRow label="LTA" value={inr(row.ltaAmount)} />}
        {Number(row.homeLoanInterest) > 0 && (
          <>
            <DetailRow label="Home Loan Interest u/s 24" value={inr(row.homeLoanInterest)} />
            {row.lenderName && <DetailRow label="Lender" value={`${row.lenderName}${row.lenderType ? ` (${row.lenderType})` : ""}`} />}
          </>
        )}
        {Number(row.section80C) > 0    && <DetailRow label="80C"        value={inr(row.section80C)} />}
        {Number(row.section80CCC) > 0  && <DetailRow label="80CCC"      value={inr(row.section80CCC)} />}
        {Number(row.section80CCD1) > 0 && <DetailRow label="80CCD(1)"   value={inr(row.section80CCD1)} />}
        {Number(row.nps80CCD1B) > 0    && <DetailRow label="80CCD(1B)"  value={inr(row.nps80CCD1B)} />}
        {Number(row.section80D) > 0    && <DetailRow label="80D"        value={inr(row.section80D)} />}
        {Number(row.section80E) > 0    && <DetailRow label="80E"        value={inr(row.section80E)} />}
        {Number(row.section80G) > 0    && <DetailRow label="80G"        value={inr(row.section80G)} />}
        {Number(row.section80TTA) > 0  && <DetailRow label="80TTA"      value={inr(row.section80TTA)} />}
        {row.signedFileUrl && (
          <div className="pt-2 border-t border-gray-200 mt-2">
            <a href={row.signedFileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
              <FileText size={11} /> Signed Form 12BB
            </a>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="space-y-3">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Attached documents</h4>
        {sections.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No supporting documents attached.</p>
        ) : (
          sections.map((s) => (
            <div key={s.title}>
              <p className="text-[11px] font-semibold text-gray-700">{s.title} ({s.items.length})</p>
              <ul className="mt-1 space-y-1">
                {s.items.map((d, i) => (
                  <li key={`${d.url}-${i}`} className="flex items-center gap-2 text-[11px] bg-white border border-gray-200 rounded px-2 py-1">
                    <Paperclip size={10} className="text-gray-400" />
                    <a href={d.url} target="_blank" rel="noreferrer" className="font-medium text-gray-900 hover:text-blue-600 hover:underline truncate flex-1">
                      {d.name}
                    </a>
                    {d.label && <span className="px-1 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-medium shrink-0">{d.label}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs py-1 border-b border-gray-200 last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold text-gray-900 tabular-nums">{value}</span>
    </div>
  );
}
