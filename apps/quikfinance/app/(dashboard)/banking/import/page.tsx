"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { PageHeader } from "@/components/shared/PageHeader";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type AmountType = "double" | "single_signed" | "single_typed";
const selectCls = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

/** Minimal CSV/TSV parser (handles quotes + escaped quotes). */
function parseDelimited(text: string): { headers: string[]; rows: string[][] } {
  const delim = text.includes("\t") && !text.split("\n")[0].includes(",") ? "\t" : ",";
  const out: string[][] = [];
  let field = "", record: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === delim) { record.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i += 1; record.push(field); field = ""; if (record.some((x) => x.length)) out.push(record); record = []; }
    else field += c;
  }
  if (field.length || record.length) { record.push(field); if (record.some((x) => x.length)) out.push(record); }
  if (!out.length) return { headers: [], rows: [] };
  return { headers: out[0].map((h) => h.trim()), rows: out.slice(1) };
}

/** Convert a value in the chosen date format to ISO (YYYY-MM-DD). */
function toISODate(value: string, fmt: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const parts = v.split(/[/\-.]/).map((p) => p.trim());
  if (parts.length < 3) return v;
  const order = fmt.toLowerCase();
  let d: string, m: string, y: string;
  if (order.startsWith("yyyy")) { [y, m, d] = parts; }
  else if (order.startsWith("mm")) { [m, d, y] = parts; }
  else { [d, m, y] = parts; }
  if (y.length === 2) y = `20${y}`;
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const num = (s: string) => Number(String(s ?? "").replace(/[,₹$€£\s]/g, "")) || 0;

function ImportStatementsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { format } = useCurrency();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [accountId, setAccountId] = useState(params.get("account") ?? "");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] }>({ headers: [], rows: [] });
  const [amountType, setAmountType] = useState<AmountType>("double");
  const [dateFmt, setDateFmt] = useState("yyyy-MM-dd");
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts-list"],
    queryFn: async () => {
      const r = await fetch("/api/v1/bank-accounts?per_page=200");
      const list = r.ok ? (((await r.json()) as { data?: Array<Record<string, unknown>> }).data ?? []) : [];
      return list.map((a) => ({ value: String(a.id), label: String(a.name ?? "Account") }));
    }
  });

  const onFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setParsed(parseDelimited(text));
    setMap({});
  };

  const colOpts = useMemo(() => parsed.headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` })), [parsed.headers]);
  const setCol = (field: string, idx: string) => setMap((m) => ({ ...m, [field]: idx }));

  // Build signed transactions from the mapping.
  const transactions = useMemo(() => {
    if (map.date === undefined) return [] as Array<{ date: string; description: string; payee: string; reference: string; amount: number }>;
    return parsed.rows.map((r) => {
      const get = (f: string) => (map[f] !== undefined && map[f] !== "" ? r[Number(map[f])] ?? "" : "");
      let amount = 0;
      if (amountType === "double") amount = num(get("deposit")) - num(get("withdrawal"));
      else if (amountType === "single_signed") amount = num(get("amount"));
      else { const a = num(get("amount")); const ty = get("type").toLowerCase(); amount = /debit|withdraw|dr/.test(ty) ? -Math.abs(a) : Math.abs(a); }
      return { date: toISODate(get("date"), dateFmt), description: get("description"), payee: get("payee"), reference: get("reference"), amount: Math.round((amount + Number.EPSILON) * 100) / 100 };
    }).filter((t) => t.amount !== 0 && t.date);
  }, [parsed.rows, map, amountType, dateFmt]);

  const doImport = async () => {
    if (!accountId) { toast.error("Select an account."); return; }
    if (transactions.length === 0) { toast.error("No valid transactions to import. Check your field mapping."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/banking/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bank_account_id: accountId, transactions }) });
      const body = (await res.json().catch(() => null)) as { data?: { imported?: number }; error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Import failed."); return; }
      toast.success(`Imported ${body?.data?.imported ?? transactions.length} transactions.`);
      router.push("/banking");
      router.refresh();
    } finally { setBusy(false); }
  };

  const Steps = (
    <div className="flex items-center justify-center gap-3 text-sm">
      {["Configure", "Map Fields", "Preview"].map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold", step > i + 1 ? "bg-emerald-600 text-white" : step === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{step > i + 1 ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
          <span className={cn(step === i + 1 ? "font-semibold" : "text-muted-foreground")}>{s}</span>
          {i < 2 ? <span className="mx-2 h-px w-10 bg-border" /> : null}
        </div>
      ))}
    </div>
  );

  const MapRow = ({ field, label, required }: { field: string; label: string; required?: boolean }) => (
    <div className="grid grid-cols-[180px_minmax(0,320px)] items-center gap-3">
      <Label className={cn(required && "text-destructive")}>{label}{required ? "*" : ""}</Label>
      <select className={selectCls} value={map[field] ?? ""} onChange={(e) => setCol(field, e.target.value)}>
        <option value="">Select column</option>
        {colOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Import Statements" description="Upload a CSV/TSV bank statement, map its columns, and import the transactions." />
      {Steps}

      {step === 1 ? (
        <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-card">
          <div className="grid grid-cols-[180px_minmax(0,360px)] items-center gap-3">
            <Label className="text-destructive">Select an account*</Label>
            <Combobox value={accountId} onChange={setAccountId} options={accounts} placeholder="Choose your account for import" searchPlaceholder="Search accounts…" />
          </div>
          <div
            className="rounded-xl border border-dashed bg-muted/20 p-8 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
          >
            {fileName ? (
              <div className="flex flex-col items-center gap-2"><FileText className="h-7 w-7 text-primary" /><span className="text-sm font-medium">{fileName}</span><span className="text-xs text-muted-foreground">{parsed.rows.length} rows · {parsed.headers.length} columns</span>
                <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>Replace File</Button></div>
            ) : (
              <div className="flex flex-col items-center gap-2"><Upload className="h-7 w-7 text-muted-foreground" /><span className="text-sm font-medium">Drag & drop file to import</span>
                <Button size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Choose File</Button>
                <span className="text-xs text-muted-foreground">CSV or TSV</span></div>
            )}
            <input ref={fileRef} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
          </div>
          <div className="grid grid-cols-[180px_minmax(0,360px)] items-center gap-3">
            <Label className="text-destructive">Amount Column Type*</Label>
            <select className={selectCls} value={amountType} onChange={(e) => setAmountType(e.target.value as AmountType)}>
              <option value="double">Double Column (separate Withdrawals & Deposits)</option>
              <option value="single_typed">Single Column + Debit/Credit indicator</option>
              <option value="single_signed">Single Column with negative values for withdrawals</option>
            </select>
          </div>
          <div className="flex justify-between border-t pt-4">
            <span />
            <Button disabled={!accountId || parsed.rows.length === 0} onClick={() => setStep(2)}>Next</Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Map the columns in <span className="font-medium text-foreground">{fileName}</span> to QuikFinance fields.</p>
          <div className="grid grid-cols-[180px_minmax(0,320px)] items-center gap-3">
            <Label>Date Format</Label>
            <select className={selectCls} value={dateFmt} onChange={(e) => setDateFmt(e.target.value)}>
              {["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy", "dd-MM-yyyy", "dd-MMM-yyyy"].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="space-y-3 border-t pt-4">
            <MapRow field="date" label="Date" required />
            <MapRow field="description" label="Description" />
            <MapRow field="payee" label="Payee" />
            <MapRow field="reference" label="Reference Number" />
            {amountType === "double" ? (<><MapRow field="withdrawal" label="Withdrawals" required /><MapRow field="deposit" label="Deposits" required /></>) : null}
            {amountType === "single_signed" ? <MapRow field="amount" label="Amount" required /> : null}
            {amountType === "single_typed" ? (<><MapRow field="amount" label="Amount" required /><MapRow field="type" label="Debit/Credit column" required /></>) : null}
          </div>
          <div className="flex justify-between border-t pt-4">
            <Button variant="secondary" onClick={() => setStep(1)}>Previous</Button>
            <Button disabled={map.date === undefined || map.date === ""} onClick={() => setStep(3)}>Next</Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
          <p className="text-sm">Ready to import <span className="font-semibold">{transactions.length}</span> transactions.</p>
          <div className="max-h-[420px] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-left">Payee</th><th className="px-3 py-2 text-right">Deposit</th><th className="px-3 py-2 text-right">Withdrawal</th></tr></thead>
              <tbody className="divide-y">
                {transactions.slice(0, 100).map((t, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5">{t.date}</td>
                    <td className="px-3 py-1.5">{t.description}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{t.payee}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{t.amount > 0 ? format(t.amount) : ""}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-rose-600">{t.amount < 0 ? format(-t.amount) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {transactions.length === 0 ? <p className="text-sm text-destructive">No valid transactions — go back and check the Withdrawals/Deposits (or Amount) mapping.</p> : null}
          <div className="flex justify-between border-t pt-4">
            <Button variant="secondary" onClick={() => setStep(2)}>Previous</Button>
            <Button onClick={doImport} disabled={busy || transactions.length === 0}>{busy ? "Importing…" : `Import ${transactions.length} transactions`}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// useSearchParams() must sit inside a Suspense boundary for production builds.
export default function ImportStatementsPage() {
  return (
    <Suspense fallback={null}>
      <ImportStatementsInner />
    </Suspense>
  );
}
