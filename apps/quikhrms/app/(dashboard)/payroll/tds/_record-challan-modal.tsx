"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Receipt, AlertCircle, Building2, Calendar, Hash, Info } from "lucide-react";
import { clsx } from "clsx";

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface CompanySettings { tan: string | null }
interface Period {
  id: string;
  periodYear: number;
  periodMonth: number;
  natureOfPayment: string;
  totalDeducted: string | number;
  totalAllocated: string | number;
  status: "Pending" | "Overdue" | "Partial" | "Paid" | "Excess";
}

interface DefaultPeriod {
  periodYear: number;
  periodMonth: number;
  pendingAmount: number;
}

export function RecordChallanModal({
  open,
  onClose,
  defaultPeriod,
}: {
  open: boolean;
  onClose: () => void;
  defaultPeriod: DefaultPeriod | null;
}) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  // ── Bank reference
  const [cin, setCin] = useState("");
  const [bsrCode, setBsrCode] = useState("");
  const [challanSerial, setChallanSerial] = useState("");
  const [depositDate, setDepositDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<"OnlineITNS" | "NEFT" | "RTGS" | "Cheque">("OnlineITNS");
  const [bankName, setBankName] = useState("");
  const [acknowledgmentNumber, setAcknowledgmentNumber] = useState("");

  // ── Tax breakdown
  const [basicTax, setBasicTax] = useState<number | null>(null);
  const [surcharge, setSurcharge] = useState(0);
  const [educationCess, setEducationCess] = useState(0);
  const [interest, setInterest] = useState(0);
  const [lateFee, setLateFee] = useState(0);
  const [others, setOthers] = useState(0);

  // ── Period allocation (single for v1; future: split into multiple)
  const [allocPeriodYear, setAllocPeriodYear] = useState<number>(new Date().getFullYear());
  const [allocPeriodMonth, setAllocPeriodMonth] = useState<number>(new Date().getMonth() + 1);

  // Reset / prefill on open
  useEffect(() => {
    if (!open) return;
    setCin("");
    setBsrCode("");
    setChallanSerial("");
    setDepositDate(new Date().toISOString().slice(0, 10));
    setPaymentMode("OnlineITNS");
    setBankName("");
    setAcknowledgmentNumber("");
    setSurcharge(0);
    setEducationCess(0);
    setInterest(0);
    setLateFee(0);
    setOthers(0);

    if (defaultPeriod) {
      setBasicTax(defaultPeriod.pendingAmount > 0 ? defaultPeriod.pendingAmount : null);
      setAllocPeriodYear(defaultPeriod.periodYear);
      setAllocPeriodMonth(defaultPeriod.periodMonth);
    } else {
      setBasicTax(null);
      // default to previous month
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      setAllocPeriodYear(d.getFullYear());
      setAllocPeriodMonth(d.getMonth() + 1);
    }
  }, [open, defaultPeriod]);

  // ── Reference data
  const { data: companyData } = useQuery({
    queryKey: ["company-settings-tan"],
    queryFn: () => api.get<CompanySettings>("/api/v1/hrms/settings/company"),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const tanNumber = companyData?.data?.tan ?? "";
  const tanMissing = !tanNumber;

  // Used to surface "Period pending" and validation
  const { data: liabilityData } = useQuery({
    queryKey: ["tds-liability-all", allocPeriodYear, allocPeriodMonth],
    queryFn: () => {
      const m = allocPeriodMonth;
      const y = allocPeriodYear;
      const fyStart = m >= 4 ? y : y - 1;
      const fy = `${fyStart}-${((fyStart + 1) % 100).toString().padStart(2, "0")}`;
      return api.get<{ periods: Period[] }>(`/api/v1/hrms/payroll/tds/liability?fy=${fy}`);
    },
    enabled: open,
  });
  const matchedPeriod = liabilityData?.data?.periods.find(
    (p) => p.periodYear === allocPeriodYear && p.periodMonth === allocPeriodMonth,
  );
  const periodPending = matchedPeriod
    ? Math.max(0, Number(matchedPeriod.totalDeducted) - Number(matchedPeriod.totalAllocated))
    : 0;

  // ── Derived totals + validations
  const totalAmount = useMemo(
    () => (basicTax ?? 0) + surcharge + educationCess + interest + lateFee + others,
    [basicTax, surcharge, educationCess, interest, lateFee, others],
  );

  // Auto-suggest interest u/s 201(1A): 1.5% per started month from end-of-deduction-period to deposit date.
  const interestSuggestion = useMemo(() => {
    if (!basicTax || !depositDate) return 0;
    // Deduction "end" is the last day of the period being allocated.
    const deductionEnd = new Date(Date.UTC(allocPeriodYear, allocPeriodMonth, 0));
    // Statutory due date = 7th of next month
    const due = allocPeriodMonth === 3
      ? new Date(Date.UTC(allocPeriodYear, 3, 30))
      : new Date(Date.UTC(allocPeriodMonth === 12 ? allocPeriodYear + 1 : allocPeriodYear, allocPeriodMonth % 12, 7));
    const dep = new Date(depositDate);
    if (dep <= due) return 0;
    // Months counted as full months between deductionEnd and deposit date
    let months = (dep.getUTCFullYear() - deductionEnd.getUTCFullYear()) * 12
      + (dep.getUTCMonth() - deductionEnd.getUTCMonth());
    if (dep.getUTCDate() > deductionEnd.getUTCDate()) months += 1;
    if (months < 1) months = 1;
    return Math.round(basicTax * 0.015 * months * 100) / 100;
  }, [basicTax, depositDate, allocPeriodYear, allocPeriodMonth]);

  const errors: string[] = [];
  if (!cin.trim()) errors.push("CIN required");
  if (!/^\d{7}$/.test(bsrCode)) errors.push("BSR code must be exactly 7 digits");
  if (!challanSerial.trim()) errors.push("Challan serial required");
  if (!depositDate) errors.push("Deposit date required");
  if (new Date(depositDate) > new Date(Date.now() + 24 * 3600 * 1000)) errors.push("Deposit date cannot be in the future");
  if (!basicTax || basicTax <= 0) errors.push("Basic tax must be > 0");
  if (tanMissing) errors.push("Company TAN missing — set it in Settings → Company first");

  const submitMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/payroll/tds/challans", {
      cin: cin.trim(),
      bsrCode,
      challanSerial: challanSerial.trim(),
      depositDate,
      natureOfPayment: "92B",
      tanNumber,
      basicTax: basicTax ?? 0,
      surcharge,
      educationCess,
      interest,
      lateFee,
      others,
      totalAmount,
      paymentMode,
      bankName: bankName.trim() || null,
      acknowledgmentNumber: acknowledgmentNumber.trim() || null,
      allocations: [{
        periodYear: allocPeriodYear,
        periodMonth: allocPeriodMonth,
        amount: basicTax ?? 0,
        natureOfPayment: "92B",
      }],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tds", "challans"] });
      qc.invalidateQueries({ queryKey: ["tds", "liability"] });
      toast.success("Challan recorded", `CIN ${cin} saved & allocated to ${MONTHS[allocPeriodMonth - 1]} ${allocPeriodYear}.`);
      onClose();
    },
    onError: (e: Error) => toast.error("Save failed", e.message),
  });

  const canSubmit = errors.length === 0 && !submitMut.isPending;

  // Year options for allocation (current FY + 1 previous)
  const yearOptions = useMemo(() => {
    const now = new Date();
    const start = now.getUTCMonth() >= 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear() - 2;
    return [start, start + 1, start + 2].map((y) => ({ value: String(y), label: String(y) }));
  }, []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record TDS deposit"
      subtitle="Log a challan you've paid to the government. The amount is allocated against a deducted-but-not-yet-deposited month."
      headerIcon={<Receipt size={20} />}
      size="lg"
      bodyClassName="overflow-y-auto"
    >
      <form
        onSubmit={(e) => { e.preventDefault(); if (canSubmit) submitMut.mutate(); }}
        className="p-5 space-y-5"
      >
        {/* Period banner */}
        <div className="rounded-xl bg-blue-50 ring-1 ring-blue-100 px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-xs">
            <p className="font-bold text-blue-900">For period</p>
            <p className="text-blue-800">
              {MONTHS[allocPeriodMonth - 1]} {allocPeriodYear}{matchedPeriod && <> · pending ₹{INR.format(periodPending)}</>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Select
              value={String(allocPeriodMonth)}
              onChange={(v) => setAllocPeriodMonth(Number(v))}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
            <div className="w-24">
              <Select value={String(allocPeriodYear)} onChange={(v) => setAllocPeriodYear(Number(v))} options={yearOptions} />
            </div>
          </div>
        </div>

        {/* ── Section 1: bank reference */}
        <Section title="1. Challan reference (from bank receipt)">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="CIN" required wide>
              <input
                value={cin}
                onChange={(e) => setCin(e.target.value)}
                placeholder="e.g. 00012342024050700001"
                className={inputCls + " font-mono"}
              />
            </Field>
            <Field label="BSR code" required hint="7 digits">
              <input
                value={bsrCode}
                onChange={(e) => setBsrCode(e.target.value.replace(/\D/g, "").slice(0, 7))}
                placeholder="0001234"
                className={inputCls + " font-mono"}
              />
            </Field>
            <Field label="Challan serial" required>
              <input
                value={challanSerial}
                onChange={(e) => setChallanSerial(e.target.value)}
                placeholder="e.g. 00001"
                className={inputCls + " font-mono"}
              />
            </Field>
            <Field label="Deposit date" required>
              <input
                type="date"
                value={depositDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDepositDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Payment mode">
              <Select
                value={paymentMode}
                onChange={(v) => setPaymentMode(v as typeof paymentMode)}
                options={[
                  { value: "OnlineITNS", label: "Online (ITNS)" },
                  { value: "NEFT", label: "NEFT" },
                  { value: "RTGS", label: "RTGS" },
                  { value: "Cheque", label: "Cheque" },
                ]}
              />
            </Field>
            <Field label="Bank name">
              <input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. SBI"
                className={inputCls}
              />
            </Field>
            <Field label="E-receipt / acknowledgment #" wide>
              <input
                value={acknowledgmentNumber}
                onChange={(e) => setAcknowledgmentNumber(e.target.value)}
                placeholder="Optional"
                className={inputCls}
              />
            </Field>
          </div>
        </Section>

        {/* ── Section 2: tax breakdown */}
        <Section title="2. Tax breakdown">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Basic Tax" required>
              <NumberInput value={basicTax} onChange={(v) => setBasicTax(v)} className={inputCls + " text-right"} />
            </Field>
            <Field label="Surcharge">
              <NumberInput value={surcharge} onChange={(v) => setSurcharge(v ?? 0)} className={inputCls + " text-right"} />
            </Field>
            <Field label="Education Cess">
              <NumberInput value={educationCess} onChange={(v) => setEducationCess(v ?? 0)} className={inputCls + " text-right"} />
            </Field>
            <Field label="Interest u/s 201(1A)" hint={interestSuggestion > 0 ? `Suggested: ₹${INR.format(interestSuggestion)}` : undefined}>
              <NumberInput value={interest} onChange={(v) => setInterest(v ?? 0)} className={inputCls + " text-right"} />
            </Field>
            <Field label="Late fee u/s 234E">
              <NumberInput value={lateFee} onChange={(v) => setLateFee(v ?? 0)} className={inputCls + " text-right"} />
            </Field>
            <Field label="Other">
              <NumberInput value={others} onChange={(v) => setOthers(v ?? 0)} className={inputCls + " text-right"} />
            </Field>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">TOTAL DEPOSIT</span>
            <span className="font-bold text-lg text-gray-900 tabular-nums">₹{INR.format(totalAmount)}</span>
          </div>
        </Section>

        {/* ── Section 3: auto-derived (informational) */}
        <div className="rounded-lg bg-gray-50 ring-1 ring-gray-200 px-4 py-3 text-xs text-gray-600 space-y-1">
          <p className="font-bold text-gray-700 flex items-center gap-1.5"><Info size={12} /> Auto-filled (not editable)</p>
          <ul className="space-y-0.5">
            <li><Hash size={9} className="inline mr-1" /> TAN: <span className="font-mono font-semibold text-gray-800">{tanNumber || "(missing — set in Settings → Company)"}</span></li>
            <li><Calendar size={9} className="inline mr-1" /> Assessment Year: derived from deposit date</li>
            <li><Building2 size={9} className="inline mr-1" /> Nature of payment: <span className="font-mono">92B (Salary)</span></li>
          </ul>
        </div>

        {errors.length > 0 && (
          <div className="rounded-lg ring-1 ring-amber-200 bg-amber-50 p-3 text-xs">
            <p className="font-bold text-amber-900 inline-flex items-center gap-1.5"><AlertCircle size={12} /> Fix before saving</p>
            <ul className="list-disc list-inside text-amber-900 mt-1 space-y-0.5">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}
      </form>

      <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50/60">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 bg-white rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => submitMut.mutate()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#16243A] hover:bg-[#1E3354] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-sm font-semibold"
        >
          {submitMut.isPending && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          {submitMut.isPending ? "Saving…" : "Record & allocate"}
        </button>
      </div>
    </Modal>
  );
}

const inputCls = "w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#16243A]/20 focus:border-[#16243A]";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">{title}</h3>
      <div className="rounded-xl ring-1 ring-gray-200 bg-white p-4">{children}</div>
    </div>
  );
}

function Field({
  label, required, hint, wide, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx(wide && "md:col-span-2")}>
      <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">
        {label} {required && <span className="text-red-500">*</span>}
        {hint && <span className="ml-1 text-gray-400 font-normal normal-case">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}
