"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Lock, X, Pencil, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { ACCOUNT_GROUP_ORDER, accountTypeLabel, accountTypeMeta, groupedAccountTypes, type AccountGroup } from "@/lib/constants/account-types";

type Account = {
  id: string; code: string | null; name: string; account_type: string; parent_id: string | null;
  is_active: boolean; is_system: boolean; show_on_dashboard?: boolean; description?: string | null;
};
type Filter = "active" | "inactive" | "all";

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path);
  if (!r.ok) return [];
  const payload = (await r.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function ChartOfAccountsWorkspace() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; account?: Account } | null>(null);

  const { data: accounts = [], isPending } = useQuery({
    queryKey: ["coa-accounts"],
    queryFn: async () =>
      (await fetchList("/api/v1/accounts?per_page=300")).map((r) => ({
        id: String(r.id), code: r.code ? String(r.code) : null, name: String(r.name ?? ""), account_type: String(r.account_type ?? ""),
        parent_id: r.parent_id ? String(r.parent_id) : null, is_active: Boolean(r.is_active), is_system: Boolean(r.is_system),
        show_on_dashboard: Boolean(r.show_on_dashboard), description: r.description ? String(r.description) : null
      }) as Account)
  });

  const nameById = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts
      .filter((a) => (filter === "all" ? true : filter === "active" ? a.is_active : !a.is_active))
      .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.code ?? "").toLowerCase().includes(q) || accountTypeLabel(a.account_type).toLowerCase().includes(q))
      .sort((a, b) => {
        const ga = ACCOUNT_GROUP_ORDER.indexOf(accountTypeMeta(a.account_type)?.group ?? "Asset");
        const gb = ACCOUNT_GROUP_ORDER.indexOf(accountTypeMeta(b.account_type)?.group ?? "Asset");
        if (ga !== gb) return ga - gb;
        return (a.code ?? a.name).localeCompare(b.code ?? b.name);
      });
  }, [accounts, filter, search]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["coa-accounts"] });
  const FILTER_LABEL: Record<Filter, string> = { active: "Active Accounts", inactive: "Inactive Accounts", all: "All Accounts" };

  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterMenu value={filter} onChange={setFilter} label={FILTER_LABEL[filter]} />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 w-56 pl-8" placeholder="Search accounts…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button size="sm" onClick={() => setDialog({ mode: "create" })}><Plus className="mr-1 h-4 w-4" />New</Button>
        </div>
      </div>

      <div className={cn("grid gap-4", selectedId ? "lg:grid-cols-[minmax(320px,420px)_1fr]" : "grid-cols-1")}>
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            {!selectedId ? (
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Account Name</th>
                  <th className="px-4 py-2 text-left font-medium">Account Code</th>
                  <th className="px-4 py-2 text-left font-medium">Account Type</th>
                  <th className="px-4 py-2 text-left font-medium">Parent Account Name</th>
                </tr>
              </thead>
            ) : null}
            <tbody className="divide-y">
              {isPending ? (
                <tr><td className="px-4 py-6 text-muted-foreground" colSpan={4}>Loading…</td></tr>
              ) : visible.length === 0 ? (
                <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={4}>No accounts found.</td></tr>
              ) : (
                visible.map((a) => (
                  <tr key={a.id} onClick={() => setSelectedId(a.id)}
                    className={cn("cursor-pointer hover:bg-muted/40", selectedId === a.id && "bg-primary/5")}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {a.is_system ? <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                        <span className="font-medium text-primary">{a.name}</span>
                      </div>
                      {selectedId ? <p className="text-xs text-muted-foreground">{accountTypeLabel(a.account_type)}</p> : null}
                    </td>
                    {!selectedId ? <td className="px-4 py-2.5 text-muted-foreground">{a.code ?? ""}</td> : null}
                    {!selectedId ? <td className="px-4 py-2.5">{accountTypeLabel(a.account_type)}</td> : null}
                    {!selectedId ? <td className="px-4 py-2.5 text-muted-foreground">{a.parent_id ? nameById.get(a.parent_id) ?? "" : ""}</td> : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedId ? (
          <AccountDetailPanel
            id={selectedId}
            onClose={() => setSelectedId(null)}
            onEdit={(acc) => setDialog({ mode: "edit", account: acc })}
            onChanged={refresh}
          />
        ) : null}
      </div>

      {dialog ? (
        <AccountFormDialog
          mode={dialog.mode}
          account={dialog.account}
          accounts={accounts}
          onClose={() => setDialog(null)}
          onSaved={(id) => { setDialog(null); refresh(); if (id) setSelectedId(id); }}
        />
      ) : null}
    </div>
  );
}

function FilterMenu({ value, onChange, label }: { value: Filter; onChange: (v: Filter) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const opts: { v: Filter; l: string }[] = [{ v: "active", l: "Active Accounts" }, { v: "inactive", l: "Inactive Accounts" }, { v: "all", l: "All Accounts" }];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)} className="flex items-center gap-1 text-lg font-bold">
        {label}<ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute left-0 z-10 mt-1 min-w-[200px] rounded-md border bg-popover p-1 shadow-md">
          {opts.map((o) => (
            <button key={o.v} type="button" onMouseDown={() => { onChange(o.v); setOpen(false); }} className={cn("block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted", value === o.v && "bg-muted font-medium")}>{o.l}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AccountDetailPanel({ id, onClose, onEdit, onChanged }: { id: string; onClose: () => void; onEdit: (a: Account) => void; onChanged: () => void }) {
  const { format } = useCurrency();
  const { data: acc, isPending } = useQuery({
    queryKey: ["coa-account", id],
    queryFn: async () => {
      const r = await fetch(`/api/v1/accounts/${id}`);
      if (!r.ok) return null;
      return ((await r.json()) as { data?: Record<string, unknown> }).data ?? null;
    }
  });

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!acc) return <div className="rounded-lg border bg-card p-6 text-sm">Account not found.</div>;

  const meta = accountTypeMeta(String(acc.account_type));
  const debit = Number(acc.closing_debit ?? 0);
  const credit = Number(acc.closing_credit ?? 0);
  const net = Math.round((debit - credit) * 100) / 100;
  const side = net > 0 ? "Dr" : net < 0 ? "Cr" : meta?.normalBalance === "credit" ? "Cr" : "Dr";
  const transactions = Array.isArray(acc.transactions) ? (acc.transactions as Array<Record<string, unknown>>) : [];
  const accountForEdit: Account = {
    id: String(acc.id), code: acc.code ? String(acc.code) : null, name: String(acc.name ?? ""), account_type: String(acc.account_type ?? ""),
    parent_id: acc.parent_id ? String(acc.parent_id) : null, is_active: Boolean(acc.is_active), is_system: Boolean(acc.is_system),
    show_on_dashboard: Boolean(acc.show_on_dashboard), description: acc.description ? String(acc.description) : null
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-4 border-b p-4">
        <div>
          <p className="text-xs text-muted-foreground">{accountTypeLabel(String(acc.account_type))}</p>
          <h2 className="flex items-center gap-2 text-xl font-bold">{acc.is_system ? <Lock className="h-4 w-4 text-muted-foreground" /> : null}{String(acc.name)}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => onEdit(accountForEdit)}><Pencil className="mr-1 h-4 w-4" />Edit</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-lg bg-muted/30 p-4">
          <p className="text-xs uppercase text-muted-foreground">Closing Balance</p>
          <p className="text-2xl font-bold">{format(Math.abs(net))} <span className="text-base font-normal text-muted-foreground">({side})</span></p>
        </div>
        {acc.description ? <p className="text-sm"><span className="italic text-muted-foreground">Description : </span>{String(acc.description)}</p> : null}
        {acc.code ? <p className="text-sm text-muted-foreground">Account Code: {String(acc.code)}</p> : null}
        {acc.parent_account_name ? <p className="text-sm text-muted-foreground">Parent Account: {String(acc.parent_account_name)}</p> : null}

        <div>
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"><Pencil className="h-6 w-6" /></div>
              <p className="text-sm">There are no transactions available</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Transaction</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.map((t, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">{String(t.date ?? "")}</td>
                      <td className="px-3 py-2">{String(t.entry_number ?? "")}{t.memo ? <span className="block text-xs text-muted-foreground">{String(t.memo)}</span> : null}</td>
                      <td className="px-3 py-2 capitalize">{String(t.source_type ?? "journal").replace(/_/g, " ")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(t.debit ?? 0) ? format(Number(t.debit)) : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{Number(t.credit ?? 0) ? format(Number(t.credit)) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {!acc.is_system ? <DeleteButton id={id} onDeleted={() => { onClose(); onChanged(); }} /> : null}
      </div>
    </div>
  );
}

function DeleteButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!window.confirm("Delete this account? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/accounts/${id}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(payload?.error?.message ?? "Could not delete the account."); return; }
      toast.success("Account deleted.");
      onDeleted();
    } finally { setBusy(false); }
  };
  return <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={busy}>Delete account</Button>;
}

function AccountFormDialog({ mode, account, accounts, onClose, onSaved }: { mode: "create" | "edit"; account?: Account; accounts: Account[]; onClose: () => void; onSaved: (id?: string) => void }) {
  const isEdit = mode === "edit";
  const [accountType, setAccountType] = useState(account?.account_type ?? "other_current_asset");
  const [name, setName] = useState(account?.name ?? "");
  const [code, setCode] = useState(account?.code ?? "");
  const [description, setDescription] = useState(account?.description ?? "");
  const [parentId, setParentId] = useState(account?.parent_id ?? "");
  const [watchlist, setWatchlist] = useState(Boolean(account?.show_on_dashboard));
  const [submitting, setSubmitting] = useState(false);
  const meta = accountTypeMeta(accountType);
  const isSystem = Boolean(account?.is_system);

  // Parent options: same group, excluding self.
  const parentOptions = useMemo(
    () => accounts.filter((a) => a.id !== account?.id && accountTypeMeta(a.account_type)?.group === meta?.group).map((a) => ({ value: a.id, label: a.code ? `${a.code} · ${a.name}` : a.name })),
    [accounts, account?.id, meta?.group]
  );

  const save = async () => {
    if (!name.trim()) { toast.error("Account name is required."); return; }
    const payload = {
      account_type: accountType, name: name.trim(), code: code.trim() || null, description: description.trim() || null,
      parent_id: parentId || null, show_on_dashboard: watchlist
    };
    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/accounts/${account!.id}` : "/api/v1/accounts", {
        method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const body = (await res.json().catch(() => null)) as { data?: { id?: string }; error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not save the account."); return; }
      toast.success(isEdit ? "Account updated." : "Account created.");
      onSaved(body?.data?.id);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="mt-16 w-full max-w-2xl rounded-lg border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-lg font-semibold">{isEdit ? "Edit Account" : "Create Account"}</h2>
          <Button type="button" size="sm" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-[140px_1fr]">
          <Label className="text-destructive md:pt-2">Account Type*</Label>
          <div>
            <select
              className="h-10 w-full max-w-md rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              value={accountType} disabled={isSystem} onChange={(e) => { setAccountType(e.target.value); setParentId(""); }}>
              {groupedAccountTypes().map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </optgroup>
              ))}
            </select>
            {meta ? <p className="mt-2 max-w-md rounded-md bg-slate-900 px-3 py-2 text-xs text-slate-100">{meta.description}</p> : null}
            {isSystem ? <p className="mt-1 text-xs text-muted-foreground">The type of a system account can&apos;t be changed.</p> : null}
          </div>

          <Label className="text-destructive md:pt-2">Account Name*</Label>
          <Input className="max-w-md" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />

          <Label className="md:pt-2">Account Code</Label>
          <Input className="max-w-md" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} />

          {parentOptions.length ? (
            <>
              <Label className="md:pt-2">Parent Account</Label>
              <div className="max-w-md"><Combobox value={parentId} onChange={setParentId} placeholder="None (top-level account)" searchPlaceholder="Search accounts…" options={parentOptions} /></div>
            </>
          ) : null}

          <Label className="md:pt-2">Description</Label>
          <Textarea className="max-w-md" rows={3} maxLength={500} placeholder="Max. 500 characters" value={description} onChange={(e) => setDescription(e.target.value)} />

          <div />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-input accent-sky-600" checked={watchlist} onChange={(e) => setWatchlist(e.target.checked)} />
            Add to the watchlist on my dashboard
          </label>
        </div>

        <div className="flex items-center gap-2 border-t px-5 py-3">
          <Button type="button" onClick={save} disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
