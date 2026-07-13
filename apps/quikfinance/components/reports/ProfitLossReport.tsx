"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { InsightStrip, type SummaryItem } from "@/components/reports/InsightStrip";
import { ChevronDown, Settings2, Columns, Download, RefreshCw, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type Row = { account_id: string; code: string; name: string; description: string; amount: number; ytd: number; has_activity: boolean };
type Section = { key: string; label: string; rows: Row[]; total: number; ytd_total: number };
type Report = {
  company: string; from: string; to: string; basis: string; filter: string;
  sections: Section[]; grossProfit: number; grossProfitYtd: number; operatingProfit: number; operatingProfitYtd: number; netProfit: number; netProfitYtd: number;
};

const FISCAL_START = 4; // April
const FILTER_LABELS: Record<string, string> = { without_zero: "Accounts Without Zero Balance", all: "All Accounts", with_transactions: "Accounts With Transactions" };
const FILTER_DESC: Record<string, string> = {
  without_zero: "Every account except the ones with zero balance.",
  all: "All accounts, including the ones with zero balance.",
  with_transactions: "Only accounts with transactions in the selected period."
};

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function presetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (preset) {
    case "today": return { from: iso(now), to: iso(now) };
    case "this_week": { const day = now.getDay(); const s = new Date(now); s.setDate(now.getDate() - day); return { from: iso(s), to: iso(now) }; }
    case "this_quarter": { const q = Math.floor(m / 3) * 3; return { from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)) }; }
    case "this_year": return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "this_fiscal_year": { const fy = m + 1 >= FISCAL_START ? y : y - 1; return { from: `${fy}-${String(FISCAL_START).padStart(2, "0")}-01`, to: iso(new Date(fy + 1, FISCAL_START - 1, 0)) }; }
    case "this_month":
    default: return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  }
}
const PRESETS = [
  { key: "today", label: "Today" }, { key: "this_week", label: "This Week" }, { key: "this_month", label: "This Month" },
  { key: "this_quarter", label: "This Quarter" }, { key: "this_year", label: "This Year" }, { key: "this_fiscal_year", label: "This Fiscal Year" }, { key: "custom", label: "Custom" }
];
function fmtDMY(d: string) { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; }

export function ProfitLossReport() {
  const { format } = useCurrency();
  const [preset, setPreset] = useState("this_month");
  const initial = presetRange("this_month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [basis, setBasis] = useState("accrual");
  const [filter, setFilter] = useState("without_zero");
  const [applied, setApplied] = useState({ from: initial.from, to: initial.to, basis: "accrual", filter: "without_zero" });
  const [cols, setCols] = useState({ code: true, description: false, ytd: false });
  const [openMenu, setOpenMenu] = useState<null | "date" | "basis" | "filter">(null);
  const [colDialog, setColDialog] = useState(false);

  const { data, isFetching, refetch } = useQuery<Report | null>({
    queryKey: ["pnl", applied],
    queryFn: async () => {
      const p = new URLSearchParams(applied as unknown as Record<string, string>);
      const r = await fetch(`/api/v1/reports/profit-loss?${p.toString()}`);
      return r.ok ? (((await r.json()) as { data?: Report }).data ?? null) : null;
    }
  });

  const run = () => setApplied({ from, to, basis, filter });
  const pickPreset = (key: string) => {
    setPreset(key); setOpenMenu(null);
    if (key !== "custom") { const r = presetRange(key); setFrom(r.from); setTo(r.to); setApplied({ from: r.from, to: r.to, basis, filter }); }
  };
  const setFilterAndRun = (f: string) => { setFilter(f); setOpenMenu(null); setApplied({ from, to, basis, filter: f }); };

  const selectedColCount = 2 + (cols.code ? 1 : 0) + (cols.description ? 1 : 0) + (cols.ytd ? 1 : 0);
  const colSpan = selectedColCount;

  const sec = (k: string) => data?.sections.find((s) => s.key === k);

  const exportCsv = () => {
    if (!data) return;
    const head = ["Account", ...(cols.code ? ["Account Code"] : []), ...(cols.description ? ["Description"] : []), "Total", ...(cols.ytd ? ["Year To Date"] : [])];
    const lines = [head.join(",")];
    const pushRows = (label: string, rows: Row[], total: number, ytd: number) => {
      lines.push(`"${label}"`);
      for (const r of rows) lines.push([`"${r.name}"`, ...(cols.code ? [`"${r.code}"`] : []), ...(cols.description ? [`"${r.description}"`] : []), r.amount, ...(cols.ytd ? [r.ytd] : [])].join(","));
      lines.push([`"Total for ${label}"`, ...(cols.code ? [""] : []), ...(cols.description ? [""] : []), total, ...(cols.ytd ? [ytd] : [])].join(","));
    };
    for (const s of data.sections) pushRows(s.label, s.rows, s.total, s.ytd_total);
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `profit-and-loss_${applied.from}_${applied.to}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const Money = ({ v, bold }: { v: number; bold?: boolean }) => <span className={cn("tabular-nums", bold && "font-bold", v < 0 && "text-destructive")}>{format(v)}</span>;

  const SectionBlock = ({ section }: { section?: Section }) => {
    if (!section) return null;
    return (
      <>
        <tr className="bg-muted/20"><td className="px-4 py-2 font-semibold" colSpan={colSpan}>{section.label}</td></tr>
        {section.rows.map((r) => (
          <tr key={r.account_id} className="hover:bg-muted/30">
            <td className="px-4 py-1.5 pl-8 text-primary">{r.name}</td>
            {cols.code ? <td className="px-4 py-1.5 text-muted-foreground">{r.code}</td> : null}
            {cols.description ? <td className="px-4 py-1.5 text-muted-foreground">{r.description}</td> : null}
            <td className="px-4 py-1.5 text-right"><Money v={r.amount} /></td>
            {cols.ytd ? <td className="px-4 py-1.5 text-right"><Money v={r.ytd} /></td> : null}
          </tr>
        ))}
        <tr className="border-t">
          <td className="px-4 py-1.5 font-medium">Total for {section.label}</td>
          {cols.code ? <td /> : null}{cols.description ? <td /> : null}
          <td className="px-4 py-1.5 text-right"><Money v={section.total} bold /></td>
          {cols.ytd ? <td className="px-4 py-1.5 text-right"><Money v={section.ytd_total} bold /></td> : null}
        </tr>
      </>
    );
  };

  const SubtotalRow = ({ label, v, ytd }: { label: string; v: number; ytd: number }) => (
    <tr className="border-y-2 bg-muted/40">
      <td className="px-4 py-2 font-bold">{label}</td>
      {cols.code ? <td /> : null}{cols.description ? <td /> : null}
      <td className="px-4 py-2 text-right"><Money v={v} bold /></td>
      {cols.ytd ? <td className="px-4 py-2 text-right"><Money v={ytd} bold /></td> : null}
    </tr>
  );

  return (
    <div className="space-y-4 animate-fade-up" onClick={() => setOpenMenu(null)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-primary">Business Overview</p>
          <h1 className="text-xl font-bold">Profit and Loss <span className="ml-2 text-sm font-normal text-muted-foreground">From {fmtDMY(applied.from)} To {fmtDMY(applied.to)}</span></h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />Export</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => refetch()} aria-label="Refresh"><RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /></Button>
        </div>
      </div>

      {data ? (
        <InsightStrip reportKey="profit-loss" title="Profit & Loss" format={format} summary={[
          { label: "Net Profit", value: data.netProfit, tone: data.netProfit >= 0 ? "good" : "warn" },
          { label: "Gross Profit", value: data.grossProfit, tone: "neutral" },
          { label: "Operating Profit", value: data.operatingProfit, tone: data.operatingProfit >= 0 ? "good" : "warn" }
        ] satisfies SummaryItem[]} />
      ) : null}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 text-sm" onClick={(e) => e.stopPropagation()}>
        <span className="px-1 font-medium text-muted-foreground">Filters :</span>
        <div className="relative">
          <button type="button" className="flex items-center gap-1 rounded-md border px-3 py-1.5" onClick={() => setOpenMenu(openMenu === "date" ? null : "date")}>
            Date Range : <span className="font-medium">{PRESETS.find((p) => p.key === preset)?.label}</span><ChevronDown className="h-4 w-4" />
          </button>
          {openMenu === "date" ? (
            <div className="absolute z-20 mt-1 w-52 rounded-md border bg-popover p-1 shadow-md">
              {PRESETS.map((p) => (
                <button key={p.key} type="button" className={cn("block w-full rounded px-3 py-1.5 text-left hover:bg-muted", preset === p.key && "bg-muted font-medium")} onClick={() => pickPreset(p.key)}>{p.label}</button>
              ))}
            </div>
          ) : null}
        </div>
        {preset === "custom" ? (
          <>
            <Input type="date" className="h-8 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-muted-foreground">to</span>
            <Input type="date" className="h-8 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        ) : null}
        <div className="relative">
          <button type="button" className="flex items-center gap-1 rounded-md border px-3 py-1.5" onClick={() => setOpenMenu(openMenu === "basis" ? null : "basis")}>
            Report Basis : <span className="font-medium capitalize">{basis}</span><ChevronDown className="h-4 w-4" />
          </button>
          {openMenu === "basis" ? (
            <div className="absolute z-20 mt-1 w-56 rounded-md border bg-popover p-1 shadow-md">
              <button type="button" className={cn("block w-full rounded px-3 py-1.5 text-left hover:bg-muted", basis === "accrual" && "bg-muted font-medium")} onClick={() => { setBasis("accrual"); setOpenMenu(null); setApplied({ from, to, basis: "accrual", filter }); }}>Accrual</button>
              <button type="button" className="block w-full cursor-not-allowed rounded px-3 py-1.5 text-left text-muted-foreground" title="Cash basis coming soon" disabled>Cash <span className="text-xs">(coming soon)</span></button>
            </div>
          ) : null}
        </div>
        <Button type="button" size="sm" onClick={run}>Run Report</Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-end gap-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="flex items-center gap-1 text-muted-foreground" title="Comparison columns (coming soon)" disabled><Columns className="h-4 w-4" />Compare With : None</button>
        <button type="button" className="flex items-center gap-1 text-primary" onClick={() => setColDialog(true)}><Columns className="h-4 w-4" />Customize Report Columns <span className="rounded-full bg-primary/10 px-1.5">{selectedColCount}</span></button>
        <div className="relative">
          <button type="button" className="flex items-center gap-1 rounded-md border px-2 py-1.5" onClick={() => setOpenMenu(openMenu === "filter" ? null : "filter")}><Settings2 className="h-4 w-4" /></button>
          {openMenu === "filter" ? (
            <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border bg-popover p-2 shadow-md">
              <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Filter Accounts :</p>
              {Object.keys(FILTER_LABELS).map((f) => (
                <button key={f} type="button" className={cn("flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-muted", filter === f && "bg-primary/5")} onClick={() => setFilterAndRun(f)}>
                  {filter === f ? <Check className="mt-0.5 h-4 w-4 text-primary" /> : <span className="w-4" />}
                  <span><span className="block font-medium">{FILTER_LABELS[f]}</span><span className="block text-xs text-muted-foreground">{FILTER_DESC[f]}</span></span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Report */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 text-center">
          <p className="text-sm font-medium text-primary">{data?.company ?? ""}</p>
          <h2 className="text-lg font-bold">Profit and Loss</h2>
          <p className="text-xs text-muted-foreground">Basis : {(applied.basis ?? "accrual").replace(/^./, (c) => c.toUpperCase())}</p>
          <p className="text-xs text-muted-foreground">From {fmtDMY(applied.from)} To {fmtDMY(applied.to)}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Account</th>
                {cols.code ? <th className="px-4 py-2 text-left">Account Code</th> : null}
                {cols.description ? <th className="px-4 py-2 text-left">Account Description</th> : null}
                <th className="px-4 py-2 text-right">Total</th>
                {cols.ytd ? <th className="px-4 py-2 text-right">Year To Date</th> : null}
              </tr>
            </thead>
            <tbody>
              {!data ? (
                <tr><td className="px-4 py-10 text-center text-muted-foreground" colSpan={colSpan}>{isFetching ? "Loading…" : "No data."}</td></tr>
              ) : (
                <>
                  <SectionBlock section={sec("operating_income")} />
                  <SectionBlock section={sec("cogs")} />
                  <SubtotalRow label="Gross Profit" v={data.grossProfit} ytd={data.grossProfitYtd} />
                  <SectionBlock section={sec("operating_expense")} />
                  <SubtotalRow label="Operating Profit" v={data.operatingProfit} ytd={data.operatingProfitYtd} />
                  <SectionBlock section={sec("non_operating_income")} />
                  <SectionBlock section={sec("non_operating_expense")} />
                  <SubtotalRow label="Net Profit/Loss" v={data.netProfit} ytd={data.netProfitYtd} />
                </>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">**Amount is displayed in your base currency</p>
      </div>

      {colDialog ? (
        <ColumnsDialog cols={cols} onClose={() => setColDialog(false)} onApply={(c) => { setCols(c); setColDialog(false); }} />
      ) : null}
    </div>
  );
}

function ColumnsDialog({ cols, onClose, onApply }: { cols: { code: boolean; description: boolean; ytd: boolean }; onClose: () => void; onApply: (c: { code: boolean; description: boolean; ytd: boolean }) => void }) {
  const [local, setLocal] = useState(cols);
  const OPTIONAL = [
    { key: "code" as const, label: "Account Code" },
    { key: "description" as const, label: "Account Description" },
    { key: "ytd" as const, label: "Year To Date" }
  ];
  const selected = ["Account", ...(local.code ? ["Account Code"] : []), ...(local.description ? ["Account Description"] : []), "Total", ...(local.ytd ? ["Year To Date"] : [])];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="mt-16 w-full max-w-2xl rounded-lg border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3"><h2 className="text-base font-semibold">Customize Report Columns</h2><Button type="button" size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button></div>
        <div className="grid grid-cols-2 gap-6 p-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Available Columns</p>
            <div className="rounded-md border">
              {OPTIONAL.filter((o) => !local[o.key]).map((o) => (
                <button key={o.key} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setLocal((c) => ({ ...c, [o.key]: true }))}>
                  {o.label}<span className="text-primary">＋</span>
                </button>
              ))}
              {OPTIONAL.every((o) => local[o.key]) ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">All columns selected.</p> : null}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Selected Columns</p>
            <div className="rounded-md border">
              {selected.map((label) => {
                const opt = OPTIONAL.find((o) => o.label === label);
                return (
                  <div key={label} className="flex items-center justify-between px-3 py-2 text-sm">
                    {label} <span className="text-muted-foreground">(Reports)</span>
                    {opt ? <button type="button" className="text-destructive" onClick={() => setLocal((c) => ({ ...c, [opt.key]: false }))}>✕</button> : <span className="text-xs text-muted-foreground">required</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3">
          <Button type="button" onClick={() => onApply(local)}>Apply</Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
