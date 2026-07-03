"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

export default function BankRulesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    match_type: "contains",
    match_field: "description",
    match_value: "",
    transaction_type: "",
    action_category: "",
    auto_reconcile: false
  });

  const { data, isLoading } = useQuery({
    queryKey: ["bank-rules"],
    queryFn: async () => {
      const res = await fetch("/api/v1/banking/rules");
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/v1/banking/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-rules"] });
      setShowForm(false);
      setForm({ name: "", match_type: "contains", match_field: "description", match_value: "", transaction_type: "", action_category: "", auto_reconcile: false });
    }
  });

  const rules = data?.data ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.Rules", "Bank Rules")}
        description="Auto-categorize bank transactions based on description, amount, or reference patterns. Rules run in priority order."
        actionLabel="New Rule"
        actionHref="#"
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>New Bank Rule</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Rule Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Auto-categorize salaries" />
            </div>
            <div className="space-y-1">
              <Label>Match Field</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.match_field} onChange={(e) => setForm((f) => ({ ...f, match_field: e.target.value }))}>
                <option value="description">Description</option>
                <option value="amount">Amount</option>
                <option value="reference">Reference</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Match Type</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.match_type} onChange={(e) => setForm((f) => ({ ...f, match_type: e.target.value }))}>
                <option value="contains">Contains</option>
                <option value="starts_with">Starts with</option>
                <option value="ends_with">Ends with</option>
                <option value="exact">Exact</option>
                <option value="regex">Regex</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Match Value</Label>
              <Input value={form.match_value} onChange={(e) => setForm((f) => ({ ...f, match_value: e.target.value }))} placeholder="e.g. SALARY" />
            </div>
            <div className="space-y-1">
              <Label>Transaction Type</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.transaction_type} onChange={(e) => setForm((f) => ({ ...f, transaction_type: e.target.value }))}>
                <option value="">Any</option>
                <option value="credit">Credit</option>
                <option value="debit">Debit</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Category Label</Label>
              <Input value={form.action_category} onChange={(e) => setForm((f) => ({ ...f, action_category: e.target.value }))} placeholder="e.g. Salaries" />
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <input type="checkbox" id="auto_recon" checked={form.auto_reconcile} onChange={(e) => setForm((f) => ({ ...f, auto_reconcile: e.target.checked }))} />
              <Label htmlFor="auto_recon">Auto-reconcile matching transactions</Label>
            </div>
            <div className="col-span-2 flex gap-2">
              <Button onClick={() => createMutation.mutate(form as Record<string, unknown>)} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save Rule"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!showForm && (
        <Button onClick={() => setShowForm(true)}>+ New Rule</Button>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Match</th>
              <th className="text-left px-4 py-3 font-medium">Category</th>
              <th className="text-center px-4 py-3 font-medium">Auto-Reconcile</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!isLoading && rules.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No rules yet. Create rules to auto-categorize bank transactions.</td></tr>
            )}
            {rules.map((r: Record<string, unknown>) => (
              <tr key={String(r.id)} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{String(r.name)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {String(r.match_field)} {String(r.match_type)} <code className="bg-muted px-1 rounded text-xs">{String(r.match_value)}</code>
                </td>
                <td className="px-4 py-3">{String(r.action_category ?? "—")}</td>
                <td className="px-4 py-3 text-center">
                  {r.auto_reconcile ? <Badge variant="default">Yes</Badge> : <span className="text-muted-foreground">No</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Inactive"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
