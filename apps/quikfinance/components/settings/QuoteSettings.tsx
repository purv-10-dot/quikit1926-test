"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import type { QuoteSettings as Settings } from "@/lib/settings/quote";

export function QuoteSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["quote-settings"],
    queryFn: async () => {
      const r = await fetch("/api/v1/settings/quotes");
      return r.ok ? ((await r.json()).data as Settings) : null;
    }
  });
  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);

  if (!form) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/v1/settings/quotes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) { toast.error("Could not save preferences."); return; }
      toast.success("Quote preferences saved.");
      qc.invalidateQueries({ queryKey: ["quote-settings"] });
    } finally { setSaving(false); }
  };

  const check = (k: keyof Settings, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-sky-600" checked={Boolean(form[k])} onChange={(e) => set(k, e.target.checked as never)} />
      <span><span className="font-medium">{label}</span>{hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}</span>
    </label>
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Quotes — Preferences" description="Control how quotes behave: acceptance, conversion to invoices, line-item display, and defaults." />

      <Card><CardContent className="space-y-6 pt-6">
        {check("allow_editing_accepted", "Allow editing of accepted quotes")}
        {check("allow_customer_accept", "Allow customers to accept or decline the quotes via platforms like WhatsApp, and public link")}

        <div className="border-t pt-5">
          <p className="text-base font-semibold">Automate accepted quotes to invoices conversion</p>
          <div className="mt-3 space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="ac" className="accent-sky-600" checked={form.auto_convert === "none"} onChange={() => set("auto_convert", "none")} />Don&apos;t convert accepted quotes automatically</label>
            <label className="flex items-center gap-2"><input type="radio" name="ac" className="accent-sky-600" checked={form.auto_convert === "draft_invoice"} onChange={() => set("auto_convert", "draft_invoice")} />Convert accepted quotes to draft invoices <span className="text-xs text-muted-foreground">(Invoice will be saved as a draft.)</span></label>
            <label className="flex items-center gap-2"><input type="radio" name="ac" className="accent-sky-600" checked={form.auto_convert === "invoice_email"} onChange={() => set("auto_convert", "invoice_email")} />Convert accepted quotes to invoices and email it to the customer</label>
          </div>
        </div>

        <div className="border-t pt-5">
          <p className="text-base font-semibold">Progress Invoice</p>
          {check("allow_progress_invoice", "Allow creation of progress invoice from a quote", "For businesses that invoice periodically based on a project's progress.")}
        </div>

        <div className="border-t pt-5">
          <p className="text-base font-semibold">Zero-Value Line Items</p>
          {check("hide_zero_value_lines", "Hide zero-value line items", "Hides zero-value lines in a quote's PDF and Customer Portal. They remain visible while editing, and this does not apply to quotes whose total is zero.")}
        </div>

        <div className="border-t pt-5">
          <p className="text-base font-semibold">Fields to retain when converting to a sales order or invoice</p>
          <div className="mt-3 space-y-2">
            {check("retain_customer_notes", "Customer Notes")}
            {check("retain_terms", "Terms & Conditions")}
            {check("retain_address", "Address")}
          </div>
        </div>

        <div className="border-t pt-5">
          <p className="text-base font-semibold">Terms &amp; Conditions</p>
          <p className="mb-2 text-sm text-muted-foreground">Prefilled on new quotes.</p>
          <Textarea rows={4} value={form.default_terms} onChange={(e) => set("default_terms", e.target.value)} placeholder="Enter the terms and conditions of your business to be displayed on quotes." />
        </div>
      </CardContent></Card>

      <div className="flex justify-start"><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
    </div>
  );
}
