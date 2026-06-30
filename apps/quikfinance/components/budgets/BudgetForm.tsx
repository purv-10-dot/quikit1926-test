"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { ACCOUNT_GROUP_ORDER, accountTypeLabel, accountTypeMeta, type AccountGroup } from "@/lib/constants/account-types";

type Account = { id: string; code: string | null; name: string; account_type: string; group: AccountGroup | "Other" };
type Option = { id: string; label: string };
type Period = "monthly" | "quarterly" | "yearly";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FISCAL_START = 4; // org fiscal year starts April

function periodSlots(p: Period) { return p === "yearly" ? 1 : p === "quarterly" ? 4 : 12; }
function slotLabels(p: Period): string[] {
  if (p === "yearly") return ["Full Year"];
  if (p === "quarterly") return ["Q1", "Q2", "Q3", "Q4"];
  return Array.from({ length: 12 }, (_, i) => MONTHS[(FISCAL_START - 1 + i) % 12]);
}
const num = (v: number) => (v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path);
  if (!r.ok) return [];
  const payload = (await r.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function BudgetForm({ budgetId }: { budgetId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { format } = useCurrency();
  const isEdit = Boolean(budgetId);
  const thisYear = new Date().getFullYear();

  const [name, setName] = useState("");
  const [fiscalYear, setFiscalYear] = useState(thisYear);
  const [period, setPeriod] = useState<Period>("monthly");
  const [locationId, setLocationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [includeBalanceSheet, setIncludeBalanceSheet] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, number[]>>({});
  const [picker, setPicker] = useState(false);
  const [deptDialog, setDeptDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const slots = periodSlots(period);
  const labels = slotLabels(period);

  const { data: accounts = [] } = useQuery({
    queryKey: ["budget-accounts"],
    queryFn: async () => (await fetchList("/api/v1/accounts?per_page=300")).map((r) => ({
      id: String(r.id), code: r.code ? String(r.code) : null, name: String(r.name ?? ""), account_type: String(r.account_type ?? ""),
      group: accountTypeMeta(String(r.account_type))?.group ?? "Other"
    }) as Account)
  });
  const { data: warehouses = [] } = useQuery({ queryKey: ["budget-warehouses"], queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });
  const { data: departments = [], refetch: refetchDepts } = useQuery({ queryKey: ["budget-departments"], queryFn: async () => (await fetchList("/api/v1/departments")).map((r) => ({ id: String(r.id), label: r.type === "division" ? `${r.name} (Division)` : String(r.name ?? "") }) as Option) });

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const { data: existing } = useQuery({
    queryKey: ["budget", budgetId],
    enabled: isEdit,
    queryFn: async () => {
      const r = await fetch(`/api/v1/budgets/${budgetId}`);
      return r.ok ? (((await r.json()) as { data?: Record<string, unknown> }).data ?? null) : null;
    }
  });

  useEffect(() => {
    if (!existing) return;
    setName(String(existing.name ?? ""));
    setFiscalYear(Number(existing.fiscal_year ?? thisYear));
    setPeriod((String(existing.period ?? "monthly") as Period));
    setLocationId(existing.location_id ? String(existing.location_id) : "");
    setDepartmentId(existing.department_id ? String(existing.department_id) : "");
    const accs = Array.isArray(existing.accounts) ? (existing.accounts as Array<Record<string, unknown>>) : [];
    const sel: string[] = [];
    const amt: Record<string, number[]> = {};
    const s = periodSlots(String(existing.period ?? "monthly") as Period);
    for (const a of accs) {
      const id = String(a.account_id);
      sel.push(id);
      const bs = Array.isArray(a.budget_slots) ? (a.budget_slots as number[]) : [];
      amt[id] = Array.from({ length: s }, (_, i) => Number(bs[i] ?? 0));
      if (["other_asset", "other_current_asset", "fixed_asset", "cash", "bank", "accounts_receivable", "accounts_payable", "other_current_liability", "long_term_liability", "equity", "retained_earnings"].includes(String(a.account_type))) setIncludeBalanceSheet(true);
    }
    setSelected(sel);
    setAmounts(amt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  // Resize amount arrays when the period changes.
  useEffect(() => {
    setAmounts((cur) => {
      const next: Record<string, number[]> = {};
      for (const id of Object.keys(cur)) next[id] = Array.from({ length: slots }, (_, i) => Number(cur[id]?.[i] ?? 0));
      return next;
    });
  }, [slots]);

  const setAmount = (id: string, slot: number, value: string) =>
    setAmounts((cur) => {
      const arr = Array.from({ length: slots }, (_, i) => Number(cur[id]?.[i] ?? 0));
      arr[slot] = Number(value) || 0;
      return { ...cur, [id]: arr };
    });
  const rowTotal = (id: string) => (amounts[id] ?? []).reduce((s, n) => s + (n || 0), 0);

  const selectedAccounts = selected.map((id) => accountById.get(id)).filter(Boolean) as Account[];
  const incomeRows = selectedAccounts.filter((a) => a.group === "Income");
  const expenseRows = selectedAccounts.filter((a) => a.group === "Expense");
  const otherRows = selectedAccounts.filter((a) => a.group !== "Income" && a.group !== "Expense");

  const grandTotal = selected.reduce((s, id) => s + rowTotal(id), 0);

  const save = async () => {
    if (!name.trim()) { toast.error("Enter a budget name."); return; }
    if (selected.length === 0) { toast.error("Please select at least one account to create the budget."); return; }
    const payload = {
      name: name.trim(), fiscal_year: fiscalYear, period, status: "active",
      location_id: locationId || null, department_id: departmentId || null,
      lines: selected.map((id) => ({ account_id: id, amounts: amounts[id] ?? [] }))
    };
    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/budgets/${budgetId}` : "/api/v1/budgets", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => null)) as { data?: { id?: string }; error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not save the budget."); return; }
      toast.success(isEdit ? "Budget updated." : "Budget created.");
      qc.invalidateQueries({ queryKey: ["module", "budgets"] });
      const id = body?.data?.id ?? budgetId;
      router.push(id ? `/budgets/${id}` : "/budgets");
    } finally { setSubmitting(false); }
  };

  const fyOptions = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
  const fieldRow = "grid gap-2 md:grid-cols-[160px_1fr] md:items-center";

  const AmountTable = ({ title, rows }: { title: string; rows: Account[] }) =>
    rows.length ? (
      <div className="mt-4">
        <p className="mb-1 text-sm font-semibold">{title}</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="sticky left-0 bg-muted/50 px-3 py-2 text-left">Account</th>
                {labels.map((l) => <th key={l} className="px-2 py-2 text-right font-medium">{l}</th>)}
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="sticky left-0 bg-card px-3 py-1.5">{a.code ? <span className="text-muted-foreground">{a.code} · </span> : null}{a.name}</td>
                  {Array.from({ length: slots }).map((_, i) => (
                    <td key={i} className="px-1 py-1">
                      <Input type="number" step="0.01" className="h-8 w-24 text-right" value={amounts[a.id]?.[i] || ""} onChange={(e) => setAmount(a.id, i, e.target.value)} />
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">{format(rowTotal(a.id))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isEdit ? "Edit Budget" : "New Budget"}</h1>
        <Button asChild size="sm" variant="ghost"><a href="/budgets" aria-label="Close"><X className="h-4 w-4" /></a></Button>
      </div>

      <Card><CardContent className="space-y-4 pt-6">
        <div className={fieldRow}><Label className="text-destructive">Name*</Label><Input className="max-w-md" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className={fieldRow}><Label className="text-destructive">Fiscal Year*</Label>
          <select className="h-10 w-full max-w-md rounded-md border bg-background px-3 text-sm" value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))}>
            {fyOptions.map((y) => <option key={y} value={y}>{MONTHS[FISCAL_START - 1]} {y} - {MONTHS[(FISCAL_START + 10) % 12]} {y + 1}</option>)}
          </select>
        </div>
        <div className={fieldRow}><Label className="text-destructive">Budget Period*</Label>
          <select className="h-10 w-full max-w-md rounded-md border bg-background px-3 text-sm" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
          </select>
        </div>
        <div className={fieldRow}><Label>Location</Label>
          <div className="max-w-md"><Combobox value={locationId} onChange={setLocationId} placeholder="Select a location" searchPlaceholder="Search locations…" options={warehouses.map((w) => ({ value: w.id, label: w.label }))} /></div>
        </div>
        <div className={fieldRow}>
          <Label>Department / Division <span className="rounded bg-sky-100 px-1 text-[10px] font-semibold uppercase text-sky-700">Beyond Zoho</span></Label>
          <div className="flex max-w-md items-center gap-2">
            <div className="flex-1"><Combobox value={departmentId} onChange={setDepartmentId} placeholder="Company-wide (no department)" searchPlaceholder="Search departments…" options={departments.map((d) => ({ value: d.id, label: d.label }))} /></div>
            <Button type="button" size="sm" variant="secondary" onClick={() => setDeptDialog(true)}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="space-y-2 pt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase text-muted-foreground">Income and Expense Accounts</p>
          <Button type="button" size="sm" variant="secondary" onClick={() => setPicker(true)}>Configure Accounts</Button>
        </div>
        {selected.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No accounts selected yet. Click <span className="font-medium">Configure Accounts</span> to choose income and expense accounts.</p>
        ) : (
          <>
            <AmountTable title="Income" rows={incomeRows} />
            <AmountTable title="Expense" rows={expenseRows} />
            <AmountTable title="Asset, Liability & Equity" rows={otherRows} />
            <div className="flex justify-end pt-3 text-sm font-bold">Total Budget: <span className="ml-2 tabular-nums">{format(grandTotal)}</span></div>
          </>
        )}
        <label className="mt-2 flex items-center gap-2 text-sm text-primary">
          <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={includeBalanceSheet} onChange={(e) => setIncludeBalanceSheet(e.target.checked)} />
          Include Asset, Liability, and Equity Accounts in Budget
        </label>
      </CardContent></Card>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={save} disabled={submitting}>{submitting ? "Saving…" : isEdit ? "Update Budget" : "Create Budget"}</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/budgets")}>Cancel</Button>
      </div>

      {picker ? (
        <ConfigureAccountsDialog accounts={accounts} selected={selected} includeBalanceSheet={includeBalanceSheet}
          onClose={() => setPicker(false)} onUpdate={(ids) => { setSelected(ids); setPicker(false); }} />
      ) : null}
      {deptDialog ? (
        <DepartmentDialog departments={departments} onClose={() => setDeptDialog(false)} onCreated={async (id) => { await refetchDepts(); setDepartmentId(id); setDeptDialog(false); }} />
      ) : null}
    </div>
  );
}

function ConfigureAccountsDialog({ accounts, selected, includeBalanceSheet, onClose, onUpdate }: { accounts: Account[]; selected: string[]; includeBalanceSheet: boolean; onClose: () => void; onUpdate: (ids: string[]) => void }) {
  const [chosen, setChosen] = useState<Set<string>>(new Set(selected));
  const [search, setSearch] = useState("");
  const groups: (AccountGroup | "Other")[] = includeBalanceSheet ? [...ACCOUNT_GROUP_ORDER] : ["Income", "Expense"];
  const q = search.trim().toLowerCase();
  const visible = accounts.filter((a) => groups.includes(a.group)).filter((a) => !q || a.name.toLowerCase().includes(q) || accountTypeLabel(a.account_type).toLowerCase().includes(q));
  const toggle = (id: string) => setChosen((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisible = visible.length > 0 && visible.every((a) => chosen.has(a.id));
  const toggleAll = () => setChosen((c) => { const n = new Set(c); if (allVisible) visible.forEach((a) => n.delete(a.id)); else visible.forEach((a) => n.add(a.id)); return n; });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="mt-12 w-full max-w-2xl rounded-lg border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold text-destructive">Select Accounts*</h2>
          <button type="button" className="text-sm text-primary hover:underline" onClick={toggleAll}>{allVisible ? "Deselect All" : "Select All"}</button>
        </div>
        <div className="p-4">
          <div className="relative mb-2"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-8" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="max-h-[55vh] overflow-y-auto rounded-md border">
            {groups.map((g) => {
              const rows = visible.filter((a) => a.group === g);
              if (!rows.length) return null;
              return (
                <div key={g}>
                  <p className="bg-muted/60 px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground">{g}</p>
                  {rows.map((a) => (
                    <label key={a.id} className="flex cursor-pointer items-center gap-2 px-4 py-1.5 text-sm hover:bg-muted/40">
                      <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={chosen.has(a.id)} onChange={() => toggle(a.id)} />
                      <span>{a.code ? <span className="text-muted-foreground">{a.code} · </span> : null}{a.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{accountTypeLabel(a.account_type)}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3">
          <Button type="button" onClick={() => onUpdate(Array.from(chosen))}>Update</Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <span className="ml-auto text-sm text-muted-foreground">{chosen.size} selected</span>
        </div>
      </div>
    </div>
  );
}

function DepartmentDialog({ departments, onClose, onCreated }: { departments: Option[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"department" | "division">("department");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) { toast.error("Enter a name."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), type, parent_id: parentId || null }) });
      const body = (await res.json().catch(() => null)) as { data?: { id?: string }; error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not create."); return; }
      toast.success(`${type === "division" ? "Division" : "Department"} created.`);
      if (body?.data?.id) onCreated(body.data.id);
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="mt-24 w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">New Department / Division</h2>
        <Label>Type</Label>
        <select className="mb-3 mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={type} onChange={(e) => setType(e.target.value as "department" | "division")}>
          <option value="department">Department</option><option value="division">Division</option>
        </select>
        <Label>Name</Label>
        <Input className="mb-3 mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "division" ? "e.g. Sales" : "e.g. Inside Sales"} />
        {type === "department" && departments.length ? (
          <>
            <Label>Parent Division (optional)</Label>
            <div className="mb-3 mt-1"><Combobox value={parentId} onChange={setParentId} placeholder="None" searchPlaceholder="Search divisions…" options={departments.map((d) => ({ value: d.id, label: d.label }))} /></div>
          </>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={create} disabled={busy}>{busy ? "Saving…" : "Create"}</Button>
        </div>
      </div>
    </div>
  );
}
