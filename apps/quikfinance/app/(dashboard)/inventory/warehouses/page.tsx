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

export default function WarehousesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", is_default: false, notes: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const res = await fetch("/api/v1/warehouses");
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/v1/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      setShowForm(false);
      setForm({ name: "", code: "", is_default: false, notes: "" });
    }
  });

  const warehouses = data?.data ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.Warehouses", "Warehouses")}
        description="Manage storage locations. Each item can be tracked per warehouse with separate stock levels."
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>New Warehouse</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Main Warehouse" />
            </div>
            <div className="space-y-1">
              <Label>Code *</Label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="MAIN" maxLength={20} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="is_default" checked={form.is_default} onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))} />
              <Label htmlFor="is_default">Set as default warehouse</Label>
            </div>
            <div className="col-span-2 flex gap-2">
              <Button onClick={() => createMutation.mutate(form as Record<string, unknown>)} disabled={!form.name || !form.code || createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Create Warehouse"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!showForm && (
        <Button onClick={() => setShowForm(true)}>+ New Warehouse</Button>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && <p className="col-span-3 text-center text-muted-foreground py-8">Loading...</p>}
        {!isLoading && warehouses.length === 0 && (
          <div className="col-span-3 text-center text-muted-foreground py-12">
            <p className="font-medium">No warehouses yet.</p>
            <p className="text-xs mt-1">Create your first warehouse to start tracking inventory by location.</p>
          </div>
        )}
        {warehouses.map((w: Record<string, unknown>) => (
          <Card key={String(w.id)}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{String(w.name)}</CardTitle>
                <div className="flex gap-1">
                  {w.is_default ? <Badge variant="default">Default</Badge> : null}
                  <Badge variant={w.is_active ? "secondary" : "outline"}>{w.is_active ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-mono">{String(w.code)}</p>
            </CardHeader>
            {w.notes ? (
              <CardContent>
                <p className="text-sm text-muted-foreground">{String(w.notes)}</p>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
