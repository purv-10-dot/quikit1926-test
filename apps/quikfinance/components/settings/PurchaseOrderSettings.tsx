"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils/cn";
import type { PurchaseOrderSettings as Settings } from "@/lib/settings/purchase-order";

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2 text-sm">
      <span className={cn("font-medium", on ? "text-foreground" : "text-muted-foreground")}>{on ? "Enabled" : "Disabled"}</span>
      <span className={cn("relative h-6 w-11 rounded-full transition-colors", on ? "bg-sky-600" : "bg-muted-foreground/30")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

export function PurchaseOrderSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["purchase-order-settings"],
    queryFn: async () => {
      const r = await fetch("/api/v1/settings/purchase-orders");
      return r.ok ? ((await r.json()).data as Settings) : null;
    }
  });
  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);

  if (!form) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/v1/settings/purchase-orders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) { toast.error("Could not save settings."); return; }
      toast.success("Purchase order settings saved.");
      qc.invalidateQueries({ queryKey: ["purchase-order-settings"] });
    } finally { setSaving(false); }
  };

  const nextPreview = `${form.prefix}-${String(form.next_number).padStart(5, "0")}`;

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Purchase Orders — Numbering" description="Control how purchase order numbers are generated." />
      <Card><CardContent className="space-y-6 pt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-base font-semibold">Auto-generate purchase order numbers</p>
            <p className="text-sm text-muted-foreground">When enabled, a number is assigned automatically if you leave the Purchase Order# field blank. When disabled, you must enter one for each purchase order.</p>
          </div>
          <Toggle on={form.auto_generate_number} onChange={(v) => set("auto_generate_number", v)} />
        </div>

        {form.auto_generate_number ? (
          <div className="grid gap-5 border-t pt-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="prefix">Prefix</Label>
              <Input id="prefix" className="mt-1" value={form.prefix} onChange={(e) => set("prefix", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="next">Start / next number</Label>
              <Input id="next" type="number" min="1" className="mt-1" value={form.next_number} onChange={(e) => set("next_number", Number(e.target.value) as Settings["next_number"])} />
            </div>
            <p className="text-sm text-muted-foreground sm:col-span-2">Next purchase order will be at least <span className="font-medium text-foreground">{nextPreview}</span> (the series never reuses an existing number).</p>
          </div>
        ) : null}
      </CardContent></Card>
      <div><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
    </div>
  );
}
