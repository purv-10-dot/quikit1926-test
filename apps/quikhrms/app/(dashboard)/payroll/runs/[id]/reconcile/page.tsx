"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Select } from "@/components/hrms/select";
import { PageBackground } from "@/components/hrms/page-background";
import { Upload, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { clsx } from "clsx";

interface Line {
  id: string;
  payslipId: string | null;
  employeeName: string;
  bankAccount: string | null;
  amount: string;
  txnDate: string | null;
  txnRef: string | null;
  matched: boolean;
  matchReason: string | null;
}

interface Recon {
  id: string;
  fileName: string | null;
  uploadedAt: string;
  totalDebited: string;
  totalMatched: string;
  matchedCount: number;
  unmatchedCount: number;
  status: "Pending" | "Matched" | "Unmatched" | "PartiallyMatched" | "Failed";
  lines: Line[];
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const STATUS_CLS: Record<Recon["status"], string> = {
  Pending: "bg-gray-100 text-gray-700",
  Matched: "bg-emerald-100 text-emerald-700",
  Unmatched: "bg-red-100 text-red-700",
  PartiallyMatched: "bg-amber-100 text-amber-700",
  Failed: "bg-red-100 text-red-700",
};

export default function ReconcilePage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const params = useParams();
  const runId = params.id as string;

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "reconcile", runId],
    queryFn: () => api.get<Recon[]>(`/api/v1/hrms/payroll/runs/${runId}/reconcile`),
  });
  const recons = data?.data ?? [];

  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [delimiter, setDelimiter] = useState<"," | "|" | "\t">(",");
  const [colMap, setColMap] = useState({ date: 0, name: 1, ref: 2, amount: 3, account: 4, ifsc: 5 });

  const uploadMut = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/hrms/payroll/runs/${runId}/reconcile`, {
        csv, fileName: fileName || null, delimiter, columnMap: colMap,
      }),
    onSuccess: () => {
      toast.success("Reconciliation complete", "Bank file processed.");
      setCsv(""); setFileName("");
      qc.invalidateQueries({ queryKey: ["payroll", "reconcile", runId] });
    },
  });

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    setCsv(text);
  };

  const inputCls =
    "w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-[#166534]";

  return (
    <div className="space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
        <h1 className="text-page-title text-gray-900">Bank Reconciliation</h1>
        <p className="text-xs text-gray-500 mt-1">
          Upload bank debit statement (CSV) to auto-match against payslips by amount + name/account.
        </p>

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".csv,.txt"
              onChange={onFileChange}
              className="text-xs text-gray-700 file:mr-3 file:px-3 file:py-1.5 file:bg-[#22c55e] file:hover:bg-green-700 file:text-white file:font-semibold file:rounded-md file:border-0"
            />
            <Select
              value={delimiter === "\t" ? "tab" : delimiter}
              onChange={(v) => setDelimiter((v === "tab" ? "\t" : v) as "," | "|" | "\t")}
              className="w-32"
              options={[
                { value: ",", label: "Comma" },
                { value: "|", label: "Pipe" },
                { value: "tab", label: "Tab" },
              ]}
            />
          </div>

          <div className="grid grid-cols-6 gap-2">
            {(["date", "name", "ref", "amount", "account", "ifsc"] as const).map((k) => (
              <div key={k}>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">{k} col</label>
                <NumberInput
                  allowDecimal={false}
                  min="0"
                  value={colMap[k]}
                  onChange={(v) => setColMap({ ...colMap, [k]: v ?? 0 })}
                  className={inputCls}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Or paste CSV directly</label>
            <textarea
              rows={4}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder="2026-04-30,JOHN DOE,UTR123,75000,XXXX1234,HDFC0001234"
              className={inputCls + " font-mono text-xs"}
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => uploadMut.mutate()}
              disabled={!csv.trim() || uploadMut.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium"
            >
              <Upload size={13} /> {uploadMut.isPending ? "Processing…" : "Upload & Match"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-[13px] font-semibold text-gray-900">Reconciliation History</h2>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-xs text-gray-500">Loading…</div>
        ) : recons.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500">No reconciliation runs yet.</div>
        ) : (
          recons.map((r) => (
            <div key={r.id} className="border-b border-gray-100">
              <div className="px-4 py-3 flex items-center justify-between bg-gray-50/50">
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">{r.fileName ?? "Pasted CSV"}</p>
                  <p className="text-xs text-gray-500">{new Date(r.uploadedAt).toLocaleString("en-IN")} · {r.lines.length} lines</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-600">Debited: <strong>₹{INR.format(Number(r.totalDebited))}</strong></span>
                  <span className="text-gray-600">Matched: <strong className="text-emerald-700">₹{INR.format(Number(r.totalMatched))}</strong></span>
                  <span className={clsx("inline-block px-2 py-0.5 rounded text-[11px] font-medium", STATUS_CLS[r.status])}>{r.status}</span>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-table-head font-bold text-gray-500 uppercase border-b border-gray-200">
                    <th className="text-left py-1.5 px-3">Date</th>
                    <th className="text-left py-1.5 px-3">Name (bank)</th>
                    <th className="text-left py-1.5 px-3">Account</th>
                    <th className="text-left py-1.5 px-3">Ref</th>
                    <th className="text-right py-1.5 px-3">Amount</th>
                    <th className="text-left py-1.5 px-3 w-32">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {r.lines.map((l) => (
                    <tr key={l.id} className={clsx("border-b border-gray-50", !l.matched && "bg-red-50/40")}>
                      <td className="py-1.5 px-3 text-gray-700">{l.txnDate ? new Date(l.txnDate).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="py-1.5 px-3 text-[13px] font-medium text-gray-900">{l.employeeName}</td>
                      <td className="py-1.5 px-3 text-gray-700 font-mono">{l.bankAccount ?? "—"}</td>
                      <td className="py-1.5 px-3 text-gray-700 font-mono">{l.txnRef ?? "—"}</td>
                      <td className="py-1.5 px-3 text-right text-gray-900">₹{INR.format(Number(l.amount))}</td>
                      <td className="py-1.5 px-3">
                        {l.matched ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} /> Matched</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600" title={l.matchReason ?? ""}><XCircle size={12} /> Unmatched</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        <p>
          Match heuristic: amount equality (±1) AND (account-last4 substring OR name fuzzy match). Manual override coming.
        </p>
      </div>
    </div>
  );
}
