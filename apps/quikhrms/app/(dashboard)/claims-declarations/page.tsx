"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import Link from "next/link";
import { FileCheck, Receipt, FileText, ShieldCheck, Info, Save, Lock, Unlock, ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import { Select } from "@/components/hrms/ui/select";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { Tooltip } from "@/components/hrms/tooltip";
import { PageBackground } from "@/components/hrms/page-background";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { EmployeeClaimSection } from "../payroll/claims-declarations/_components/employee-claim-section";
import { Form12BBSubmissions } from "../payroll/claims-declarations/_components/form12bb-submissions";
import { PoiReview } from "../payroll/claims-declarations/_components/poi-review";

type TabKey = "Reimbursement" | "ITDeclaration" | "POI";
const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "Reimbursement", label: "Reimbursement Claims",   icon: <Receipt size={13} /> },
  { key: "ITDeclaration", label: "Income Tax Declaration", icon: <FileText size={13} /> },
  { key: "POI",           label: "Proof Of Investments",   icon: <ShieldCheck size={13} /> },
];

interface Res {
  settings: {
    id: string;
    itDeclarationReleased: boolean;
    itDeclarationReleasedAt: string | null;
    poiReleased: boolean;
    poiReleasedAt: string | null;
    poiStartMonth: number;
    allowRegimeSwitch: boolean;
    allowTDSModification: boolean;
    allowTDSModificationPayroll: boolean;
    defaultRegime: "OldRegime" | "NewRegime";
  } | null;
  hasActiveFBP: boolean;
  hasActiveReimbursement: boolean;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function ClaimsDeclarationsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("Reimbursement");

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "claims-declarations"],
    queryFn: () => api.get<Res>("/api/v1/hrms/payroll/claims-declarations"),
  });

  const info = data?.data;

  return (
    <div className="w-full px-5 py-4 space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-start gap-3 mb-2">
        <FileCheck size={28} className="text-[#22c55e] mt-1.5" />
        <h1 className="text-page-title text-gray-900 leading-tight">Claims and declarations</h1>
        <Tooltip
          placement="bottom"
          maxWidth={300}
          content="Reimbursement Claims here are tax-free salary components (e.g. fuel, telephone) — submit bills to save tax on them. For work expenses you paid out-of-pocket and want reimbursed, use the Expenses module instead."
        >
          <button type="button" aria-label="About Claims and declarations" className="mt-2 text-gray-400 hover:text-[#22c55e]">
            <Info size={18} />
          </button>
        </Tooltip>
      </div>
      <div className="surface-card overflow-hidden">
        <div className="border-b border-gray-200 px-4">
          <div className="flex gap-4 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                data-active={tab === t.key}
                className={clsx(
                  "tab-underline whitespace-nowrap py-3 px-1 text-[13px] -mb-px inline-flex items-center gap-1.5",
                  tab === t.key ? "text-[#22c55e] font-semibold" : "text-gray-500 hover:text-gray-700",
                )}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {isLoading ? (
            <SkeletonTable rows={5} cols={4} />
          ) : (
            <>
              {/* Reimbursement no longer gated on hasActiveReimbursement — fixed
                  category list is always available; EmployeeClaimSection owns its UI. */}
              {tab === "Reimbursement" && <EmployeeClaimSection kind="Reimbursement" />}
              {tab === "ITDeclaration" && <ITDeclarationTab info={info} onSaved={() => qc.invalidateQueries({ queryKey: ["payroll", "claims-declarations"] })} />}
              {tab === "POI"           && <POITab info={info} onSaved={() => qc.invalidateQueries({ queryKey: ["payroll", "claims-declarations"] })} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type ITSubTab = "settings" | "submissions";
type POISubTab = "settings" | "queue";

function SubTabSwitch<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 mb-4">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "px-3 py-1.5 text-xs font-semibold rounded transition",
            value === o.value
              ? "bg-white text-[#166534] shadow-sm"
              : "text-gray-600 hover:text-gray-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ITDeclarationTab({ info, onSaved }: { info: Res | undefined; onSaved: () => void }) {
  const api = useApiClient();
  const { hasPermission, isLoading: roleLoading } = useDashboardConfig();
  const isAdmin = hasPermission("hrms.settings.write");
  const [subTab, setSubTab] = useState<ITSubTab>("settings");
  const [released, setReleased] = useState(info?.settings?.itDeclarationReleased ?? false);
  const [allowRegimeSwitch, setAllowRegimeSwitch] = useState(info?.settings?.allowRegimeSwitch ?? true);
  const [allowTDSMod, setAllowTDSMod] = useState(info?.settings?.allowTDSModification ?? false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (info?.settings) {
      setReleased(info.settings.itDeclarationReleased);
      setAllowRegimeSwitch(info.settings.allowRegimeSwitch);
      setAllowTDSMod(info.settings.allowTDSModification);
    }
  }, [info]);

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put("/api/v1/hrms/payroll/claims-declarations", body),
    onSuccess: () => { onSaved(); setErr(null); },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setErr(e.message),
  });

  // ── Employee view — CTA → /hrms/payroll/form12bb ──
  if (!roleLoading && !isAdmin) {
    return <EmployeeITDView released={info?.settings?.itDeclarationReleased ?? false} />;
  }

  return (
    <div>
      <SubTabSwitch
        value={subTab}
        onChange={setSubTab}
        options={[
          { value: "settings",    label: "Settings" },
          { value: "submissions", label: "Submissions" },
        ]}
      />

      {subTab === "submissions" ? (
        <Form12BBSubmissions />
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-gray-700 max-w-2xl">
              Employees can declare their tax saving investments and expense details through the employee portal once you enable this option.
            </p>
            <Link
              href="/payroll/form12bb"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#166534] text-[#166534] hover:bg-[#166534] hover:text-white rounded-md text-xs font-medium transition-colors"
            >
              Submit your own <ArrowRight size={12} />
            </Link>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gradient-to-b from-gray-50/50 to-white p-8 text-center">
            <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-[#dcfce7] to-[#dcfce7] flex items-center justify-center mb-4">
              {released ? <Unlock size={40} className="text-emerald-500" strokeWidth={1.5} /> : <Lock size={40} className="text-[#bbf7d0]" strokeWidth={1.5} />}
            </div>
            <p className="text-[13px] font-semibold text-gray-900">{released ? "IT Declaration is Released" : "IT Declaration is Locked"}</p>
            <p className="text-xs text-gray-600 mt-2 max-w-2xl mx-auto">
              {released
                ? "Employees can now submit their IT Declaration through their portal. You can lock it anytime."
                : "Release IT Declaration so employees can submit Form 12BB."}
            </p>
            <button
              onClick={() => saveMut.mutate({ itDeclarationReleased: !released })}
              disabled={saveMut.isPending}
              className="mt-4 px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium disabled:opacity-60"
            >
              {released ? "Lock IT Declaration" : "Release IT Declaration"}
            </button>
          </div>

          <div>
            <p className="text-[13px] font-semibold text-gray-900">Other Configurations</p>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={allowRegimeSwitch} onChange={(e) => setAllowRegimeSwitch(e.target.checked)} className="text-[#22c55e] rounded" />
                Allow employees to switch tax regimes
              </label>
              <label className="flex items-start gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={allowTDSMod} onChange={(e) => setAllowTDSMod(e.target.checked)} className="mt-0.5 text-[#22c55e] rounded" />
                <span>
                  Allow TDS modification to exceed the current fiscal year&apos;s calculated tax amount
                  <Info size={11} className="inline-block ml-1 text-gray-400" />
                </span>
              </label>
            </div>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{err}</p>}

          <div className="pt-2">
            <button
              onClick={() => saveMut.mutate({ allowRegimeSwitch, allowTDSModification: allowTDSMod })}
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm"
            >
              <Save size={13} /> {saveMut.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function POITab({ info, onSaved }: { info: Res | undefined; onSaved: () => void }) {
  const api = useApiClient();
  const { hasPermission, isLoading: roleLoading } = useDashboardConfig();
  const isAdmin = hasPermission("hrms.settings.write");
  const [subTab, setSubTab] = useState<POISubTab>("settings");
  const [released, setReleased] = useState(info?.settings?.poiReleased ?? false);
  const [startMonth, setStartMonth] = useState(info?.settings?.poiStartMonth ?? 3);
  const [allowRegimeSwitch, setAllowRegimeSwitch] = useState(info?.settings?.allowRegimeSwitch ?? true);
  const [allowTDSPayroll, setAllowTDSPayroll] = useState(info?.settings?.allowTDSModificationPayroll ?? false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (info?.settings) {
      setReleased(info.settings.poiReleased);
      setStartMonth(info.settings.poiStartMonth);
      setAllowRegimeSwitch(info.settings.allowRegimeSwitch);
      setAllowTDSPayroll(info.settings.allowTDSModificationPayroll);
    }
  }, [info]);

  const saveMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put("/api/v1/hrms/payroll/claims-declarations", body),
    onSuccess: () => { onSaved(); setErr(null); },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setErr(e.message),
  });

  // ── Employee view — proofs auto-attach via Form 12BB ──
  if (!roleLoading && !isAdmin) {
    return <EmployeePOIView released={info?.settings?.poiReleased ?? false} />;
  }

  return (
    <div>
      <SubTabSwitch
        value={subTab}
        onChange={setSubTab}
        options={[
          { value: "settings", label: "Settings" },
          { value: "queue",    label: "Review Queue" },
        ]}
      />

      {subTab === "queue" ? (
        <PoiReview />
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-gray-700 max-w-2xl">
              Employees can submit the necessary supporting documents for their declared investments through the employee portal once you enable this option.
            </p>
            <Link
              href="/payroll/form12bb"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#166534] text-[#166534] hover:bg-[#166534] hover:text-white rounded-md text-xs font-medium transition-colors"
            >
              Submit your own <ArrowRight size={12} />
            </Link>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gradient-to-b from-gray-50/50 to-white p-8 text-center">
            <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-[#dcfce7] to-[#dcfce7] flex items-center justify-center mb-4">
              {released ? <Unlock size={40} className="text-emerald-500" strokeWidth={1.5} /> : <Lock size={40} className="text-[#bbf7d0]" strokeWidth={1.5} />}
            </div>
            <p className="text-[13px] font-semibold text-gray-900">{released ? "POI is Released" : "POI is Locked"}</p>
            <p className="text-xs text-gray-600 mt-2 max-w-2xl mx-auto">
              {released
                ? "Employees can now submit their investment proofs via the portal."
                : "Release POI so employees can attach proofs to their declarations."}
            </p>
            <button
              onClick={() => saveMut.mutate({ poiReleased: !released })}
              disabled={saveMut.isPending}
              className="mt-4 px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium disabled:opacity-60"
            >
              {released ? "Lock Proof Of Investments" : "Release Proof Of Investments"}
            </button>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold text-gray-900">Process payroll with approved POI amount from</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  The approved POI amount will be considered for the payroll from <span className="font-semibold">{MONTHS[startMonth - 1]}</span> onwards.
                </p>
              </div>
              <div className="text-right">
                <Select
                  value={String(startMonth)}
                  onChange={(v) => setStartMonth(Number(v))}
                  options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                  className="w-40"
                />
                <p className="text-[11px] text-gray-500 mt-1">for upcoming years.</p>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-[13px] font-semibold text-gray-900">Other Configurations</p>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={allowRegimeSwitch} onChange={(e) => setAllowRegimeSwitch(e.target.checked)} className="text-[#22c55e] rounded" />
                Allow employees to switch tax regimes
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={allowTDSPayroll} onChange={(e) => setAllowTDSPayroll(e.target.checked)} className="text-[#22c55e] rounded" />
                Allow TDS modification during Payroll
              </label>
            </div>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{err}</p>}

          <div className="pt-2">
            <button
              onClick={() => saveMut.mutate({ poiStartMonth: startMonth, allowRegimeSwitch, allowTDSModificationPayroll: allowTDSPayroll })}
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm"
            >
              <Save size={13} /> {saveMut.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Employee views — CTA pointing at /hrms/payroll/form12bb
// ─────────────────────────────────────────────────────────────────

function StatusBanner({
  open, openCopy, closedCopy,
}: { open: boolean; openCopy: string; closedCopy: string }) {
  return (
    <div
      className={clsx(
        "flex items-start gap-3 rounded-md border px-4 py-3 text-xs",
        open
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-gray-200 bg-gray-50 text-gray-700",
      )}
    >
      {open ? <Unlock size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <Lock size={16} className="mt-0.5 shrink-0 text-gray-500" />}
      <div>
        <p className="text-[13px] font-semibold">{open ? "Window is open" : "Window is closed"}</p>
        <p className="text-xs mt-0.5 opacity-90">{open ? openCopy : closedCopy}</p>
      </div>
    </div>
  );
}

function EmployeeITDView({ released }: { released: boolean }) {
  return (
    <div className="max-w-2xl mx-auto py-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-lg bg-green-50 text-[#22c55e] flex items-center justify-center shrink-0">
          <FileText size={20} />
        </div>
        <div>
          <h3 className="font-serif-display text-base font-semibold text-gray-900 leading-tight">Income Tax Declaration</h3>
          <p className="text-xs text-gray-600 mt-1">
            Declare your planned tax-saving investments and exemptions (rent, 80C, 80D, home loan interest, etc.) so
            payroll deducts the right TDS each month — instead of the full default.
          </p>
        </div>
      </div>

      <StatusBanner
        open={released}
        openCopy="HR has opened submissions. Fill Form 12BB now to update your monthly TDS for the rest of the FY."
        closedCopy="HR has not opened submissions yet for this FY. Check back later, or ask your payroll admin."
      />

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[13px] font-semibold text-gray-900">What you&apos;ll need</p>
        <ul className="mt-2 space-y-1.5 text-xs text-gray-700">
          <li className="flex items-start gap-2"><span className="text-[#22c55e]">•</span><span>Rent details + landlord PAN (if claiming HRA &gt; ₹1L/yr)</span></li>
          <li className="flex items-start gap-2"><span className="text-[#22c55e]">•</span><span>Investment proofs: LIC, PPF, ELSS, NPS — to claim 80C / 80CCD</span></li>
          <li className="flex items-start gap-2"><span className="text-[#22c55e]">•</span><span>Health insurance premium receipt — to claim 80D</span></li>
          <li className="flex items-start gap-2"><span className="text-[#22c55e]">•</span><span>Home loan interest certificate — to claim u/s 24</span></li>
          <li className="flex items-start gap-2"><span className="text-[#22c55e]">•</span><span>Donation receipts — to claim 80G</span></li>
        </ul>

        <div className="mt-5 flex justify-end">
          <Link
            href="/payroll/form12bb"
            aria-disabled={!released}
            tabIndex={released ? 0 : -1}
            className={clsx(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium shadow-sm",
              released
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-200 text-gray-500 cursor-not-allowed pointer-events-none",
            )}
          >
            {released ? "Submit IT Declaration" : "Submissions closed"}
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      <p className="text-[11px] text-gray-500 text-center">
        You can re-submit any time before HR closes the window. The latest submission replaces the previous one.
      </p>
    </div>
  );
}

function EmployeePOIView({ released }: { released: boolean }) {
  return (
    <div className="max-w-2xl mx-auto py-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-lg bg-green-50 text-[#22c55e] flex items-center justify-center shrink-0">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h3 className="font-serif-display text-base font-semibold text-gray-900 leading-tight">Proof of Investments</h3>
          <p className="text-xs text-gray-600 mt-1">
            At year-end, payroll needs proof of the investments you declared. Without proof, the tax-saving deduction
            is reversed and TDS is recovered from your final payslips.
          </p>
        </div>
      </div>

      <StatusBanner
        open={released}
        openCopy="HR has opened proof submission. Attach receipts to each declared section in Form 12BB."
        closedCopy="HR has not opened proof submission yet. Check back closer to year-end."
      />

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[13px] font-semibold text-gray-900">How proofs are submitted</p>
        <p className="text-xs text-gray-700 mt-1.5">
          Proofs attach automatically when you upload supporting documents in your Form 12BB declaration — each
          section (HRA, 80C, 80D, home loan, etc.) gets a separate review row that HR can approve, partially approve,
          or reject.
        </p>
        <p className="text-xs text-gray-700 mt-2">
          Use the same Form 12BB page — add or replace documents per section, then re-submit.
        </p>

        <div className="mt-5 flex justify-end">
          <Link
            href="/payroll/form12bb"
            aria-disabled={!released}
            tabIndex={released ? 0 : -1}
            className={clsx(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium shadow-sm",
              released
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-200 text-gray-500 cursor-not-allowed pointer-events-none",
            )}
          >
            {released ? "Attach Investment Proofs" : "Submissions closed"}
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
