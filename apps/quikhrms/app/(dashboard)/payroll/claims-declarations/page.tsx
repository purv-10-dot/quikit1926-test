"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { FileCheck, Receipt, FileText, ShieldCheck, Gift, Info, Save, Lock, Unlock } from "lucide-react";
import { clsx } from "clsx";
import { Select } from "@/components/hrms/ui/select";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { TabSwitcher } from "@/components/hrms/tab-switcher";
import { EmployeeClaimSection } from "./_components/employee-claim-section";

type TabKey = "FBP" | "Reimbursement" | "ITDeclaration" | "POI";
const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "FBP", label: "Flexible Benefit Plan", icon: <Gift size={14} /> },
  { key: "Reimbursement", label: "Reimbursement Claims", icon: <Receipt size={14} /> },
  { key: "ITDeclaration", label: "Income Tax Declaration", icon: <FileText size={14} /> },
  { key: "POI", label: "Proof Of Investments", icon: <ShieldCheck size={14} /> },
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
  const [tab, setTab] = useState<TabKey>("FBP");

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "claims-declarations"],
    queryFn: () => api.get<Res>("/api/v1/hrms/payroll/claims-declarations"),
  });

  const info = data?.data;

  return (
    <div className="max-w-5xl mx-auto px-5 py-4 space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-start gap-3 mb-2">
        <FileCheck size={28} className="text-[#22c55e] mt-1.5" />
        <h1 className="text-page-title text-gray-900 leading-tight">Claims and declarations</h1>
      </div>
      <TabSwitcher
        value={tab}
        onChange={(v) => setTab(v as TabKey)}
        tabs={TABS.map((t) => ({ value: t.key, label: t.label, icon: t.icon }))}
      />
      <div className="surface-card overflow-hidden">
        <div className="p-4">
          {isLoading ? (
            <SkeletonTable rows={5} cols={4} />
          ) : (
            <>
              {tab === "FBP" && <FBPTab hasActive={info?.hasActiveFBP ?? false} />}
              {tab === "Reimbursement" && <ReimbursementTab hasActive={info?.hasActiveReimbursement ?? false} />}
              {tab === "ITDeclaration" && <ITDeclarationTab info={info} onSaved={() => qc.invalidateQueries({ queryKey: ["payroll", "claims-declarations"] })} />}
              {tab === "POI" && <POITab info={info} onSaved={() => qc.invalidateQueries({ queryKey: ["payroll", "claims-declarations"] })} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyCard({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gradient-to-b from-gray-50/50 to-white p-10 text-center">
      <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-[#dcfce7] to-[#dcfce7] flex items-center justify-center mb-4">
        <Info size={40} className="text-[#bbf7d0]" strokeWidth={1.5} />
      </div>
      <p className="text-[13px] font-semibold text-gray-900">{title}</p>
      <p className="text-xs text-gray-600 mt-2 max-w-2xl mx-auto">{body}</p>
    </div>
  );
}

function FBPTab({ hasActive }: { hasActive: boolean }) {
  if (hasActive) {
    return <EmployeeClaimSection kind="FBP" />;
  }
  return (
    <EmptyCard
      title="No Active FBP component"
      body={
        <>
          Your organisation does not have an active FBP component associated to an employee. Mark a reimbursement as FBP component under{" "}
          <Link href="/payroll/setup/salary-components" className="text-[#22c55e] hover:underline">
            Settings → Salary Components → Reimbursements
          </Link>{" "}
          and associate it to the employee&apos;s salary.
        </>
      }
    />
  );
}

function ReimbursementTab({ hasActive }: { hasActive: boolean }) {
  if (hasActive) {
    return <EmployeeClaimSection kind="Reimbursement" />;
  }
  return (
    <EmptyCard
      title="No Active Reimbursement"
      body={
        <>
          Employees can get tax exemptions on producing necessary bills. You can enable a reimbursement component under{" "}
          <Link href="/payroll/setup/salary-components" className="text-[#22c55e] hover:underline">
            Settings → Salary Components → Reimbursements
          </Link>{" "}
          and associate it to the employee&apos;s salary.
        </>
      }
    />
  );
}

function ITDeclarationTab({ info, onSaved }: { info: Res | undefined; onSaved: () => void }) {
  const api = useApiClient();
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

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-700">Employees can declare their tax saving investments and expense details through the employee portal once you enable this option.</p>
      <p className="text-xs text-gray-600 border-l-2 border-amber-400 pl-3">
        Learn how to manage investment declarations. <span className="text-[#22c55e]">IT Declaration Help Document</span>
        <br />
        Help your employees submit IT Declaration on time. <span className="text-[#22c55e]">Download and share</span> this IT Declaration ebook.
      </p>

      <div className="rounded-lg border border-gray-200 bg-gradient-to-b from-gray-50/50 to-white p-8 text-center">
        <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-[#dcfce7] to-[#dcfce7] flex items-center justify-center mb-4">
          {released ? <Unlock size={40} className="text-emerald-500" strokeWidth={1.5} /> : <Lock size={40} className="text-[#bbf7d0]" strokeWidth={1.5} />}
        </div>
        <p className="text-[13px] font-semibold text-gray-900">{released ? "IT Declaration is Released" : "IT Declaration is Locked"}</p>
        <p className="text-xs text-gray-600 mt-2 max-w-2xl mx-auto">
          {released
            ? "Employees can now submit their IT Declaration through their portal. You can lock it anytime."
            : "You are yet to enable the submission of IT Declaration for your employees through their respective portals. Release IT Declaration or submit it on their behalf under Employees → Employee profile → Investments → IT Declaration."}
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
  );
}

function POITab({ info, onSaved }: { info: Res | undefined; onSaved: () => void }) {
  const api = useApiClient();
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

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-700">Employees can submit the necessary supporting documents for their declared investments through the employee portal once you enable this option.</p>
      <p className="text-xs text-gray-600 border-l-2 border-amber-400 pl-3">
        Learn how to manage investment proofs. <span className="text-[#22c55e]">POI Help Document</span>
        <br />
        Help your employees submit POI on time. <span className="text-[#22c55e]">Download and share</span> this POI ebook.
      </p>

      <div className="rounded-lg border border-gray-200 bg-gradient-to-b from-gray-50/50 to-white p-8 text-center">
        <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-[#dcfce7] to-[#dcfce7] flex items-center justify-center mb-4">
          {released ? <Unlock size={40} className="text-emerald-500" strokeWidth={1.5} /> : <Lock size={40} className="text-[#bbf7d0]" strokeWidth={1.5} />}
        </div>
        <p className="text-[13px] font-semibold text-gray-900">{released ? "POI is Released" : "POI is Locked"}</p>
        <p className="text-xs text-gray-600 mt-2 max-w-2xl mx-auto">
          {released
            ? "Employees can now submit their investment proofs via the portal."
            : "You are yet to enable submission of investment proofs for your employees through their respective portals. Release POI or submit it on their behalf under Employees → Employee profile → Investments → Proof of Investments."}
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
              The approved POI amount will be considered for the payroll from <span className="font-semibold">{MONTHS[startMonth - 1]}</span> onwards to calculate and deduct income tax amount in subsequent payrolls.
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
  );
}
