"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { useCurrencyOptions } from "@/lib/hooks/use-currency-options";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils/cn";

export default function AddBankAccountPage() {
  const router = useRouter();
  const [kind, setKind] = useState<"bank" | "credit_card">("bank");
  const [name, setName] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [description, setDescription] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, setBusy] = useState(false);

  const currencyOptions = useCurrencyOptions();

  const save = async () => {
    if (!name.trim()) { toast.error("Enter an account name."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/banking/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name: name.trim(), account_code: accountCode.trim() || null, currency, account_number: accountNumber.trim() || null, bank_name: bankName.trim() || null, ifsc: ifsc.trim() || null, description: description.trim() || null, is_primary: isPrimary })
      });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not add the account."); return; }
      toast.success(`${kind === "credit_card" ? "Credit card" : "Bank account"} added.`);
      router.push("/banking");
      router.refresh();
    } finally { setBusy(false); }
  };

  const Row = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div className="grid grid-cols-[160px_minmax(0,420px)] items-start gap-4">
      <Label className={cn("pt-2", required && "text-destructive")}>{label}{required ? "*" : ""}</Label>
      <div>{children}</div>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Add Bank or Credit Card" description="Creates a banking account and a matching ledger account in your chart of accounts." />

      <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
        <Row label="Select Account Type" required>
          <div className="flex items-center gap-5 pt-1.5">
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={kind === "bank"} onChange={() => setKind("bank")} />Bank</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={kind === "credit_card"} onChange={() => setKind("credit_card")} />Credit Card</label>
          </div>
        </Row>
        <Row label="Account Name" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "credit_card" ? "e.g. HDFC Credit Card" : "e.g. HDFC Current A/c"} /></Row>
        <Row label="Account Code"><Input value={accountCode} onChange={(e) => setAccountCode(e.target.value)} /></Row>
        <Row label="Currency" required><Combobox value={currency} onChange={setCurrency} options={currencyOptions} placeholder="Select currency" searchPlaceholder="Search currencies…" /></Row>
        <Row label={kind === "credit_card" ? "Card Number" : "Account Number"}><Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></Row>
        <Row label={kind === "credit_card" ? "Issuer" : "Bank Name"}><Input value={bankName} onChange={(e) => setBankName(e.target.value)} /></Row>
        {kind === "bank" ? <Row label="IFSC"><Input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} maxLength={11} /></Row> : null}
        <Row label="Description"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Max. 500 characters" maxLength={500} /></Row>
        <Row label=""><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="h-4 w-4" />Make this primary</label></Row>
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="secondary" onClick={() => router.push("/banking")}>Cancel</Button>
      </div>
    </div>
  );
}
