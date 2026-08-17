"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, MapPin, Banknote, IdCard, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Select } from "@/components/hrms/ui/select";

const INDIAN_BANKS = [
  "HDFC Bank",
  "ICICI Bank",
  "State Bank of India",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "Bank of India",
  "Indian Bank",
  "IndusInd Bank",
  "Yes Bank",
  "IDFC FIRST Bank",
  "Federal Bank",
  "RBL Bank",
  "Bandhan Bank",
  "South Indian Bank",
  "DBS Bank India",
  "Standard Chartered Bank",
  "Citi Bank",
  "HSBC India",
  "Central Bank of India",
  "UCO Bank",
  "Indian Overseas Bank",
  "Punjab & Sind Bank",
  "Bank of Maharashtra",
  "IDBI Bank",
  "Karur Vysya Bank",
  "City Union Bank",
  "Karnataka Bank",
  "Tamilnad Mercantile Bank",
  "DCB Bank",
  "CSB Bank",
  "Jana Small Finance Bank",
  "AU Small Finance Bank",
  "Equitas Small Finance Bank",
  "Ujjivan Small Finance Bank",
  "FINO Payments Bank",
  "Airtel Payments Bank",
  "India Post Payments Bank",
  "Paytm Payments Bank",
];

interface IfscApiResponse {
  BANK?: string;
  BRANCH?: string;
  CITY?: string;
  STATE?: string;
  IFSC?: string;
  ADDRESS?: string;
}

type BankAccountType = "Savings" | "Current" | "Salary" | "NRE" | "NRO";

interface BankFieldsValue {
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankBranch: string;
  bankAccountType?: BankAccountType | "";
}

const ACCOUNT_TYPES: BankAccountType[] = ["Savings", "Current", "Salary", "NRE", "NRO"];

interface Props {
  value: BankFieldsValue;
  onChange: (patch: Partial<BankFieldsValue>) => void;
  inputCls: string;
  /** Show a red asterisk on the mandatory fields (IFSC, Bank Name, Account Number). */
  markRequired?: boolean;
}

const inputClsBase = "w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-[#166534]";

export function BankDetailsFields({ value, onChange, inputCls = inputClsBase, markRequired = false }: Props) {
  const [ifscState, setIfscState] = useState<"idle" | "loading" | "ok" | "invalid">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ifsc = value.bankIfsc.trim().toUpperCase();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!ifsc) {
      setIfscState("idle");
      return;
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      setIfscState("invalid");
      return;
    }

    setIfscState("loading");
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://ifsc.razorpay.com/${ifsc}`);
        if (!res.ok) {
          setIfscState("invalid");
          return;
        }
        const data: IfscApiResponse = await res.json();
        const matchedBank = matchBank(data.BANK ?? "");
        onChange({
          bankName: matchedBank,
          bankBranch: data.BRANCH ?? "",
        });
        setIfscState("ok");
      } catch {
        setIfscState("invalid");
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.bankIfsc]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-4">
        <Field label="IFSC Code" required={markRequired} hint={ifscState === "ok" ? "Bank + branch auto-filled" : ifscState === "invalid" ? "Invalid IFSC — fill bank manually" : undefined} hintColor={ifscState === "ok" ? "text-emerald-600" : "text-amber-600"}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
              <IdCard size={14} />
            </span>
            <input
              placeholder="e.g. HDFC0001772"
              value={value.bankIfsc}
              onChange={(e) => onChange({ bankIfsc: e.target.value.toUpperCase() })}
              className={`${inputCls} !pl-9 !pr-9 font-mono`}
              maxLength={11}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
              {ifscState === "loading" && <Loader2 size={14} className="text-gray-400 animate-spin" />}
              {ifscState === "ok" && <CheckCircle2 size={14} className="text-emerald-500" />}
              {ifscState === "invalid" && <AlertCircle size={14} className="text-amber-500" />}
            </span>
          </div>
        </Field>

        <Field label="Bank Name" required={markRequired}>
          <Select
            value={value.bankName}
            onChange={(v) => onChange({ bankName: v })}
            options={INDIAN_BANKS.map((b) => ({ value: b, label: b }))}
            placeholder="Select bank"
            searchable
          />
        </Field>

        <Field label="Branch Name">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
              <MapPin size={14} />
            </span>
            <input
              placeholder="Auto-filled from IFSC"
              value={value.bankBranch}
              onChange={(e) => onChange({ bankBranch: e.target.value })}
              className={`${inputCls} !pl-9`}
            />
          </div>
        </Field>

        <Field label="Account Number" required={markRequired}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
              <Banknote size={14} />
            </span>
            <input
              inputMode="numeric"
              placeholder="Enter account number"
              value={value.bankAccountNumber}
              onChange={(e) => onChange({ bankAccountNumber: e.target.value.replace(/\D/g, "") })}
              className={`${inputCls} !pl-9 font-mono`}
              maxLength={20}
            />
          </div>
        </Field>

        <Field label="Account Type">
          <Select
            value={value.bankAccountType ?? ""}
            onChange={(v) => onChange({ bankAccountType: (v as BankAccountType) || "" })}
            options={ACCOUNT_TYPES.map((t) => ({ value: t, label: t }))}
            placeholder="Select type"
          />
        </Field>
      </div>
      <p className="text-[11px] text-gray-500 mt-3">
        Tip: type IFSC first — bank name and branch auto-fill from RBI registry. Salary credited to this account.
      </p>
    </>
  );
}

function matchBank(apiBank: string): string {
  if (!apiBank) return "";
  const normalized = apiBank.trim().toUpperCase();
  const found = INDIAN_BANKS.find((b) => normalized.includes(b.toUpperCase()) || b.toUpperCase().includes(normalized));
  return found ?? apiBank.trim();
}

function Field({ label, required, hint, hintColor, children }: { label: string; required?: boolean; hint?: string; hintColor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className={`text-[11px] mt-1 ${hintColor ?? "text-gray-500"}`}>{hint}</p>}
    </div>
  );
}
