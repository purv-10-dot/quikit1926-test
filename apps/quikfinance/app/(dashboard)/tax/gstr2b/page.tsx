"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoneyDigits } from "@/lib/utils/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(v: number) {
  return formatMoneyDigits(v, 0);
}

const STATUS_LABELS: Record<string, { label: string; color: "default" | "secondary" | "destructive" | "outline" }> = {
  matched: { label: "Matched", color: "default" },
  mismatch: { label: "Mismatch", color: "destructive" },
  missing_in_books: { label: "Missing in Books", color: "outline" },
  missing_in_2b: { label: "Missing in 2B", color: "secondary" },
  unmatched: { label: "Unmatched", color: "secondary" }
};

export default function Gstr2bPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [filterStatus, setFilterStatus] = useState("all");
  const [jsonInput, setJsonInput] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["gstr2b", month, year, filterStatus],
    queryFn: async () => {
      const url = filterStatus === "all"
        ? `/api/v1/tax/gstr2b?month=${month}&year=${year}`
        : `/api/v1/tax/gstr2b?month=${month}&year=${year}&status=${filterStatus}`;
      const res = await fetch(url);
      return res.json();
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(jsonInput);
      const res = await fetch("/api/v1/tax/gstr2b", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_month: month, period_year: year, items: parsed })
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gstr2b"] });
      setShowUpload(false);
      setJsonInput("");
    }
  });

  const rows = data?.data ?? [];
  const summary = data?.meta?.summary ?? {};

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.GSTR-2B Recon", "GSTR-2B ITC Reconciliation")}
        description="Compare Input Tax Credit from GSTR-2B (supplier-filed data) with your books. Identify mismatches, missing invoices, and unreconciled claims."
      />

      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-md border bg-background px-3 py-2 text-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select className="rounded-md border bg-background px-3 py-2 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={() => setShowUpload((v) => !v)}>
          {showUpload ? "Cancel" : "Upload GSTR-2B Data"}
        </Button>
      </div>

      {showUpload && (
        <Card>
          <CardHeader><CardTitle>Upload GSTR-2B JSON</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Paste the GSTR-2B items array (JSON) from the portal. Each item needs: supplier_gstin, taxable_value_2b, tax_2b.</p>
            <textarea
              className="w-full rounded-md border bg-background p-3 text-sm font-mono h-40 resize-y"
              placeholder='[{"supplier_gstin":"27AABCU9603R1ZX","taxable_value_2b":10000,"tax_2b":1800}]'
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={() => uploadMutation.mutate()} disabled={!jsonInput || uploadMutation.isPending}>
                {uploadMutation.isPending ? "Processing..." : "Run Reconciliation"}
              </Button>
            </div>
            {uploadMutation.isError && <p className="text-sm text-red-600">Upload failed. Check JSON format.</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Items</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{summary.total ?? 0}</p></CardContent></Card>
        <Card className="border-green-200"><CardHeader className="pb-2"><CardTitle className="text-sm text-green-600">Matched</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-green-600">{summary.matched ?? 0}</p></CardContent></Card>
        <Card className="border-red-200"><CardHeader className="pb-2"><CardTitle className="text-sm text-red-600">Mismatched</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-red-600">{summary.mismatched ?? 0}</p></CardContent></Card>
        <Card className="border-amber-200"><CardHeader className="pb-2"><CardTitle className="text-sm text-amber-600">ITC in 2B</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-amber-600">{fmt(summary.total_itc_2b ?? 0)}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", "matched", "mismatch", "missing_in_books", "missing_in_2b"].map((s) => (
          <Button key={s} size="sm" variant={filterStatus === s ? "default" : "outline"} onClick={() => setFilterStatus(s)}>
            {STATUS_LABELS[s]?.label ?? "All"}
          </Button>
        ))}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Supplier GSTIN</th>
              <th className="text-left px-4 py-3 font-medium">Supplier</th>
              <th className="text-right px-4 py-3 font-medium">Taxable (2B)</th>
              <th className="text-right px-4 py-3 font-medium">Tax (2B)</th>
              <th className="text-right px-4 py-3 font-medium">Taxable (Books)</th>
              <th className="text-right px-4 py-3 font-medium">Tax (Books)</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No reconciliation data. Upload GSTR-2B data to begin.</td></tr>
            )}
            {rows.map((r: Record<string, unknown>) => {
              const s = STATUS_LABELS[String(r.status)] ?? STATUS_LABELS.unmatched;
              return (
                <tr key={String(r.id)} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{String(r.supplier_gstin)}</td>
                  <td className="px-4 py-3">{String(r.supplier_name ?? "—")}</td>
                  <td className="px-4 py-3 text-right">{r.taxable_value_2b != null ? fmt(Number(r.taxable_value_2b)) : "—"}</td>
                  <td className="px-4 py-3 text-right">{r.tax_2b != null ? fmt(Number(r.tax_2b)) : "—"}</td>
                  <td className="px-4 py-3 text-right">{r.taxable_value_books != null ? fmt(Number(r.taxable_value_books)) : "—"}</td>
                  <td className="px-4 py-3 text-right">{r.tax_books != null ? fmt(Number(r.tax_books)) : "—"}</td>
                  <td className="px-4 py-3 text-center"><Badge variant={s.color}>{s.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
