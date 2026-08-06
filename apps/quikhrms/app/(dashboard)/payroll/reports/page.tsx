"use client";

import { useState } from "react";
import { Select } from "@/components/hrms/ui/select";
import { useApiClient, ApiError } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { PageBackground } from "@/components/hrms/page-background";
import { FileBarChart2, Download, AlertCircle, FileCheck2, Loader2 } from "lucide-react";
import { clsx } from "clsx";

const REPORTS: { kind: string; label: string; description: string; supportsState?: boolean }[] = [
  { kind: "register", label: "Payroll Register", description: "Full earnings + deductions matrix per employee." },
  { kind: "deductions", label: "Deductions Summary", description: "EPF, ESI, PT, LWF, TDS, loan deductions per employee." },
  { kind: "pf-ecr", label: "PF Electronic Challan Return (ECR)", description: "Format ready for EPFO Unified Portal upload." },
  { kind: "esi-challan", label: "ESI Monthly Contribution", description: "ESIC contribution sheet." },
  { kind: "pt-challan", label: "Professional Tax Challan", description: "State-wise PT collection. Filter by state.", supportsState: true },
  { kind: "lwf-challan", label: "Labour Welfare Fund (LWF)", description: "State LWF contribution summary." },
  { kind: "variance", label: "Variance Report", description: "Net pay change vs prior month per employee." },
];

const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Odisha", "Punjab",
  "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function PayrollReportsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [state, setState] = useState("");
  const api = useApiClient();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const download = async (key: string, url: string, filename: string) => {
    if (pending) return;
    setPending(key);
    try {
      await api.download(url, filename);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "Download failed");
      toast.error("Download failed", msg);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center gap-3">
        <FileBarChart2 className="text-[#166534]" />
        <div>
          <h1 className="text-page-title text-gray-900">Payroll reports</h1>
          <p className="text-sm text-gray-500">Statutory filings, registers, and variance analysis.</p>
        </div>
      </div>

      <div className="surface-card p-4 flex items-end gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 border border-[var(--border)] rounded-md text-sm w-44 focus:outline-none focus:ring-1 focus:ring-[#166534]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">State (PT only)</label>
          <Select
            value={state}
            onChange={setState}
            options={[{ value: "", label: "All states" }, ...STATES.map((s) => ({ value: s, label: s }))]}
            className="w-56"
          />
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        <p>
          Reports include <strong>Released + Generated</strong> payslips. Statutory formats are spec-compliant draft templates;
          verify exact field order against the latest portal-published spec before upload.
        </p>
      </div>

      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mt-2">Monthly Reports</h2>
      <div className="grid grid-cols-2 gap-4">
        {REPORTS.map((r) => {
          const params = new URLSearchParams({ kind: r.kind, month });
          if (r.supportsState && state) params.set("state", state);
          const url = `/api/v1/hrms/payroll/reports?${params.toString()}`;
          const filename = `${r.kind}-${month}${r.supportsState && state ? `-${state}` : ""}.csv`;
          return (
            <ReportCard
              key={r.kind}
              label={r.label}
              description={r.description}
              loading={pending === r.kind}
              onClick={() => download(r.kind, url, filename)}
            />
          );
        })}
      </div>

      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mt-4 flex items-center gap-2">
        <FileCheck2 size={14} /> Statutory Returns
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <ReportCard
          label="PF ECR (Full Spec)"
          description="EPFO ECR v2.0 — 11-field #~# delimited TXT for Unified Portal upload."
          loading={pending === "pf-ecr-full"}
          onClick={() => download(
            "pf-ecr-full",
            `/api/v1/hrms/payroll/statutory-returns?kind=pf-ecr-full&month=${month}`,
            `pf-ecr-${month}.txt`,
          )}
        />
        <HalfYearlyReport month={month} state={state} pending={pending} download={download} />
      </div>
    </div>
  );
}

function ReportCard({ label, description, loading, onClick }: { label: string; description: string; loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={clsx(
        "w-full text-left rounded-lg border border-gray-200 bg-white p-4 hover:border-[#166534] hover:shadow-md transition group disabled:opacity-60 disabled:cursor-wait",
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900 group-hover:text-[#166534]">{label}</p>
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        </div>
        {loading
          ? <Loader2 size={16} className="text-[#166534] animate-spin" />
          : <Download size={16} className="text-gray-400 group-hover:text-[#166534]" />}
      </div>
    </button>
  );
}

function HalfYearlyReport({
  month, state, pending, download,
}: {
  month: string;
  state: string;
  pending: string | null;
  download: (key: string, url: string, filename: string) => void;
}) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const half = m >= 4 && m <= 9 ? `${y}-H1` : m >= 10 ? `${y}-H2` : `${y - 1}-H2`;
  const lwfState = state || "Maharashtra";
  return (
    <>
      <ReportCard
        label={`ESIC Half-Yearly Return (${half})`}
        description="Apr-Sep / Oct-Mar aggregated wages, contributions, days per IP."
        loading={pending === "esic-half-yearly"}
        onClick={() => download(
          "esic-half-yearly",
          `/api/v1/hrms/payroll/statutory-returns?kind=esic-half-yearly&half=${half}`,
          `esic-${half}.csv`,
        )}
      />
      <ReportCard
        label={`LWF State Return (${half}) — ${state || "select state"}`}
        description="State Labour Welfare Fund half-yearly contribution sheet."
        loading={pending === "lwf-state-return"}
        onClick={() => download(
          "lwf-state-return",
          `/api/v1/hrms/payroll/statutory-returns?kind=lwf-state-return&half=${half}&state=${lwfState}`,
          `lwf-${lwfState}-${half}.csv`,
        )}
      />
    </>
  );
}
