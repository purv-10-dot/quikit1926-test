"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoneyDigits } from "@/lib/utils/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

const ENTITY_TYPES = ["invoice", "bill", "expense", "payment", "journal_entry", "credit_note", "vendor_credit"];
const APPROVER_ROLES = ["owner", "admin", "accountant"];

const ENTITY_LABELS: Record<string, string> = {
  invoice: "Invoice",
  bill: "Bill",
  expense: "Expense",
  payment: "Payment",
  journal_entry: "Journal Entry",
  credit_note: "Credit Note",
  vendor_credit: "Vendor Credit"
};

interface PolicyForm {
  name: string;
  entity_type: string;
  min_amount: string;
  max_amount: string;
  approver_role: string;
  require_all: boolean;
}

const defaultForm: PolicyForm = {
  name: "",
  entity_type: "invoice",
  min_amount: "",
  max_amount: "",
  approver_role: "admin",
  require_all: false
};

export default function ApprovalPoliciesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PolicyForm>(defaultForm);

  const { data, isLoading } = useQuery({
    queryKey: ["approval-policies"],
    queryFn: async () => {
      const res = await fetch("/api/v1/approvals/policies");
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: async (payload: PolicyForm) => {
      const res = await fetch("/api/v1/approvals/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          min_amount: payload.min_amount ? Number(payload.min_amount) : null,
          max_amount: payload.max_amount ? Number(payload.max_amount) : null
        })
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-policies"] });
      setShowForm(false);
      setForm(defaultForm);
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await fetch(`/api/v1/approvals/policies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active })
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approval-policies"] })
  });

  const policies = data?.data ?? [];

  function fmt(v: number | null) {
    if (v == null) return "—";
    return formatMoneyDigits(v, 0);
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Approval Policies"
        description="Define rules for when transactions require approval before posting. Policies match by entity type and amount range."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Policies</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{policies.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Active</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-green-600">{policies.filter((p: Record<string, unknown>) => p.is_active).length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Entity Types Covered</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{new Set(policies.map((p: Record<string, unknown>) => p.entity_type)).size}</p></CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? "outline" : "default"}>
          {showForm ? "Cancel" : "New Policy"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Create Approval Policy</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Policy Name</Label>
                <Input
                  placeholder="e.g. High-value invoice approval"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Entity Type</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.entity_type}
                  onChange={(e) => setForm({ ...form, entity_type: e.target.value })}
                >
                  {ENTITY_TYPES.map((et) => (
                    <option key={et} value={et}>{ENTITY_LABELS[et] ?? et}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Min Amount (₹)</Label>
                <Input
                  type="number"
                  placeholder="0 = no minimum"
                  value={form.min_amount}
                  onChange={(e) => setForm({ ...form, min_amount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Max Amount (₹)</Label>
                <Input
                  type="number"
                  placeholder="Leave blank = no maximum"
                  value={form.max_amount}
                  onChange={(e) => setForm({ ...form, max_amount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Approver Role</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.approver_role}
                  onChange={(e) => setForm({ ...form, approver_role: e.target.value })}
                >
                  {APPROVER_ROLES.map((r) => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="require_all"
                  checked={form.require_all}
                  onChange={(e) => setForm({ ...form, require_all: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="require_all">Require all approvers</Label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.name || !form.entity_type}
              >
                {createMutation.isPending ? "Creating…" : "Create Policy"}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setForm(defaultForm); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Policy</th>
              <th className="text-left px-4 py-3 font-medium">Entity</th>
              <th className="text-right px-4 py-3 font-medium">Min</th>
              <th className="text-right px-4 py-3 font-medium">Max</th>
              <th className="text-left px-4 py-3 font-medium">Approver Role</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && policies.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No approval policies yet. Create one to require review before posting transactions.</td></tr>
            )}
            {policies.map((p: Record<string, unknown>) => (
              <tr key={String(p.id)} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{String(p.name)}</td>
                <td className="px-4 py-3">
                  <Badge variant="secondary">{ENTITY_LABELS[String(p.entity_type)] ?? String(p.entity_type)}</Badge>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{fmt(p.min_amount as number | null)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{fmt(p.max_amount as number | null)}</td>
                <td className="px-4 py-3">
                  <span className="capitalize">{String(p.approver_role)}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={p.is_active ? "default" : "secondary"}>
                    {p.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleMutation.mutate({ id: String(p.id), is_active: !p.is_active })}
                    disabled={toggleMutation.isPending}
                  >
                    {p.is_active ? "Disable" : "Enable"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
