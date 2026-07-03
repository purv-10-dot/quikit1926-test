"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils/cn";
import { DATA_TYPES, DATA_TYPE_LABELS } from "@/lib/settings/custom-field-shared";
import { DEFAULT_BILLING_FORMAT, DEFAULT_SHIPPING_FORMAT } from "@/lib/settings/customer-vendor";

const TABS = ["General", "Field Customization", "Custom Buttons", "Related Lists"] as const;
type Tab = (typeof TABS)[number];

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

const PLACEHOLDERS = [
  "CONTACT_DISPLAYNAME", "CONTACT_ADDRESS", "CONTACT_CITY", "CONTACT_STATE", "CONTACT_CODE", "CONTACT_COUNTRY",
  "CONTACT_PHONE", "CONTACT_EMAIL", "CONTACT_GSTIN", "CONTACT_PAN"
];

type Settings = {
  allow_duplicate_names: boolean;
  enable_customer_numbers: boolean;
  enable_vendor_numbers: boolean;
  default_customer_type: "business" | "individual";
  credit_limit_enabled: boolean;
  credit_limit_action: "restrict" | "warn";
  credit_limit_include_so: boolean;
  multi_currency_enabled: boolean;
  billing_address_format: string;
  shipping_address_format: string;
};

function Toggle({ on, onChange, labelOn = "Enabled", labelOff = "Disabled" }: { on: boolean; onChange: (v: boolean) => void; labelOn?: string; labelOff?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2 text-sm">
      <span className={cn("font-medium", on ? "text-foreground" : "text-muted-foreground")}>{on ? labelOn : labelOff}</span>
      <span className={cn("relative h-6 w-11 rounded-full transition-colors", on ? "bg-sky-600" : "bg-muted-foreground/30")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

export function CustomerVendorSettings() {
  const [tab, setTab] = useState<Tab>("General");
  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Customers and Vendors" description="Configure how customers and vendors are created, numbered, and shown on documents." />
      <div role="tablist" className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>
      {tab === "General" ? <GeneralTab /> : null}
      {tab === "Field Customization" ? <FieldCustomizationTab /> : null}
      {tab === "Custom Buttons" ? <PlaceholderTab title="Custom Buttons" hint="Define quick-action buttons on customer & vendor records." /> : null}
      {tab === "Related Lists" ? <PlaceholderTab title="Related Lists" hint="Show related records (e.g. projects, tickets) on customer & vendor pages." /> : null}
    </div>
  );
}

function GeneralTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["cv-settings"],
    queryFn: async () => {
      const r = await fetch("/api/v1/settings/customers-vendors");
      return r.ok ? ((await r.json()).data as Settings) : null;
    }
  });
  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);

  if (!form) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const insertPlaceholder = (field: "billing_address_format" | "shipping_address_format", token: string) =>
    set(field, `${form[field]}${form[field].endsWith("\n") || form[field] === "" ? "" : "\n"}\${CONTACT.${token}}`);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/v1/settings/customers-vendors", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) { toast.error("Could not save settings."); return; }
      toast.success("Settings saved.");
      qc.invalidateQueries({ queryKey: ["cv-settings"] });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <Card><CardContent className="space-y-6 pt-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={form.allow_duplicate_names} onChange={(e) => set("allow_duplicate_names", e.target.checked)} />
          Allow duplicates for customer and vendor display name.
        </label>

        <div className="border-t pt-5">
          <p className="text-base font-semibold">Customer &amp; Vendor Numbers</p>
          <p className="mb-3 text-sm text-muted-foreground">Generate customer and vendor numbers automatically while creating new records.</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={form.enable_customer_numbers} onChange={(e) => set("enable_customer_numbers", e.target.checked)} />Enable Customer Numbers</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={form.enable_vendor_numbers} onChange={(e) => set("enable_vendor_numbers", e.target.checked)} />Enable Vendor Numbers</label>
          </div>
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-semibold">Note:</p>
            <ul className="ml-4 list-disc">
              <li>Once enabled, new customers/vendors get an auto-generated number (CUST-/VEND- series).</li>
            </ul>
          </div>
        </div>

        <div className="border-t pt-5">
          <p className="text-base font-semibold">Default Customer Type</p>
          <p className="mb-3 text-sm text-muted-foreground">Pre-selected in the customer creation form.</p>
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="dct" className="accent-sky-600" checked={form.default_customer_type === "business"} onChange={() => set("default_customer_type", "business")} />Business</label>
            <label className="flex items-center gap-2"><input type="radio" name="dct" className="accent-sky-600" checked={form.default_customer_type === "individual"} onChange={() => set("default_customer_type", "individual")} />Individual</label>
          </div>
        </div>

        <div className="border-t pt-5">
          <div className="flex items-center justify-between">
            <div><p className="text-base font-semibold">Customer Credit Limit</p><p className="text-sm text-muted-foreground">Set a limit on the outstanding receivable amount of customers.</p></div>
            <Toggle on={form.credit_limit_enabled} onChange={(v) => set("credit_limit_enabled", v)} />
          </div>
          {form.credit_limit_enabled ? (
            <div className="mt-4 space-y-3 border-l-2 border-muted pl-4">
              <p className="text-sm font-medium">What do you want to do when credit limit is exceeded?</p>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="cla" className="accent-sky-600" checked={form.credit_limit_action === "restrict"} onChange={() => set("credit_limit_action", "restrict")} />Restrict creating or updating invoices</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="cla" className="accent-sky-600" checked={form.credit_limit_action === "warn"} onChange={() => set("credit_limit_action", "warn")} />Show a warning and allow users to proceed</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={form.credit_limit_include_so} onChange={(e) => set("credit_limit_include_so", e.target.checked)} />Include sales orders&apos; amount in limiting the credit given to customers</label>
              <p className="text-xs text-muted-foreground">Set each customer&apos;s credit limit on their record. Credit limit does not affect recurring invoices.</p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t pt-5">
          <div><p className="text-base font-semibold">Multi-currency Transactions for Each Contact</p><p className="text-sm text-muted-foreground">Create sales and purchase transactions in multiple currencies for each customer and vendor.</p></div>
          <Toggle on={form.multi_currency_enabled} onChange={(v) => set("multi_currency_enabled", v)} />
        </div>

        <div className="border-t pt-5">
          <AddressFormat label="Customer and Vendor Billing Address Format" value={form.billing_address_format}
            onChange={(v) => set("billing_address_format", v)} onInsert={(t) => insertPlaceholder("billing_address_format", t)} onReset={() => set("billing_address_format", DEFAULT_BILLING_FORMAT)} />
        </div>
        <div className="border-t pt-5">
          <AddressFormat label="Customer and Vendor Shipping Address Format" value={form.shipping_address_format}
            onChange={(v) => set("shipping_address_format", v)} onInsert={(t) => insertPlaceholder("shipping_address_format", t)} onReset={() => set("shipping_address_format", DEFAULT_SHIPPING_FORMAT)} />
        </div>
      </CardContent></Card>

      <div className="flex justify-start"><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>
    </div>
  );
}

function AddressFormat({ label, value, onChange, onInsert, onReset }: { label: string; value: string; onChange: (v: string) => void; onInsert: (token: string) => void; onReset: () => void }) {
  return (
    <div>
      <p className="text-base font-semibold">{label} <span className="text-xs font-normal text-muted-foreground">(Displayed in PDF only)</span></p>
      <div className="mt-2 overflow-hidden rounded-md border">
        <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
          <select className="h-8 rounded-md border bg-background px-2 text-sm" value="" onChange={(e) => { if (e.target.value) onInsert(e.target.value); }}>
            <option value="">Insert Placeholders</option>
            {PLACEHOLDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button type="button" className="text-xs text-primary hover:underline" onClick={onReset}>Reset to default</button>
        </div>
        <Textarea className="rounded-none border-0 font-mono text-xs" rows={6} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

type FieldDef = { id: string; label: string; field_key: string; data_type: string; is_mandatory: boolean; show_in_portal: boolean; status: string; options?: string[] | null };

function FieldCustomizationTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["cv-custom-fields"],
    queryFn: async () => ((await (await fetch("/api/v1/settings/custom-fields?entity=contacts")).json())?.data ?? []) as FieldDef[]
  });

  const remove = async (id: string) => {
    if (!window.confirm("Delete this custom field?")) return;
    const r = await fetch(`/api/v1/settings/custom-fields/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Could not delete."); return; }
    qc.invalidateQueries({ queryKey: ["cv-custom-fields"] });
  };
  const toggleStatus = async (f: FieldDef) => {
    const r = await fetch(`/api/v1/settings/custom-fields/${f.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: f.status === "active" ? "inactive" : "active" }) });
    if (!r.ok) { toast.error("Could not update."); return; }
    qc.invalidateQueries({ queryKey: ["cv-custom-fields"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Custom Fields Usage: {data.length}/135</p>
        <Button size="sm" onClick={() => setModal(true)}><Plus className="mr-1 h-4 w-4" />New Custom Field</Button>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3 text-left">Field Name</th><th className="px-4 py-3 text-left">Data Type</th><th className="px-4 py-3 text-center">Mandatory</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y">
            {data.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Do you have information that doesn&apos;t go under any existing field? Go ahead and create a custom field.</td></tr>
            ) : data.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-3 font-medium">{f.label}</td>
                <td className="px-4 py-3 text-muted-foreground">{DATA_TYPE_LABELS[f.data_type as keyof typeof DATA_TYPE_LABELS] ?? f.data_type}</td>
                <td className="px-4 py-3 text-center">{f.is_mandatory ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-center"><button type="button" onClick={() => toggleStatus(f)}><Badge variant={f.status === "active" ? "default" : "secondary"}>{f.status}</Badge></button></td>
                <td className="px-4 py-3 text-right"><Button variant="ghost" size="sm" className="px-2 text-destructive" onClick={() => remove(f.id)}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
      {modal ? <NewFieldModal onClose={() => setModal(false)} onSaved={() => { setModal(false); qc.invalidateQueries({ queryKey: ["cv-custom-fields"] }); }} /> : null}
    </div>
  );
}

function NewFieldModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState("");
  const [dataType, setDataType] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [portal, setPortal] = useState(false);
  const [options, setOptions] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!label.trim() || !dataType) { toast.error("Label and data type are required."); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { label, data_type: dataType, is_mandatory: mandatory, show_in_portal: portal, entity: "contacts" };
      if (dataType === "dropdown") body.options = options.split(",").map((o) => o.trim()).filter(Boolean);
      const r = await fetch("/api/v1/settings/custom-fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json().catch(() => null); toast.error(e?.error?.message ?? "Could not create field."); return; }
      toast.success("Custom field created.");
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="mt-16 w-full max-w-2xl rounded-lg border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Custom Field — Contacts</h2>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-[140px_1fr] items-center gap-3">
            <label className="text-sm text-red-500">Label Name*</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-[140px_1fr] items-center gap-3">
            <label className="text-sm text-red-500">Data Type*</label>
            <select className={selectClass} value={dataType} onChange={(e) => setDataType(e.target.value)}>
              <option value="">Select…</option>
              {DATA_TYPES.map((d) => <option key={d} value={d}>{DATA_TYPE_LABELS[d]}</option>)}
            </select>
          </div>
          {dataType === "dropdown" ? (
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <label className="text-sm">Options</label>
              <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Comma-separated, e.g. Gold, Silver, Bronze" />
            </div>
          ) : null}
          <div className="grid grid-cols-[140px_1fr] items-center gap-3">
            <label className="text-sm">Is Mandatory</label>
            <div className="flex gap-6 text-sm">
              <label className="flex items-center gap-2"><input type="radio" className="accent-sky-600" checked={mandatory} onChange={() => setMandatory(true)} />Yes</label>
              <label className="flex items-center gap-2"><input type="radio" className="accent-sky-600" checked={!mandatory} onChange={() => setMandatory(false)} />No</label>
            </div>
          </div>
          <div className="grid grid-cols-[140px_1fr] items-center gap-3">
            <label className="text-sm">Display in Portal</label>
            <div className="flex gap-6 text-sm">
              <label className="flex items-center gap-2"><input type="radio" className="accent-sky-600" checked={portal} onChange={() => setPortal(true)} />Yes</label>
              <label className="flex items-center gap-2"><input type="radio" className="accent-sky-600" checked={!portal} onChange={() => setPortal(false)} />No</label>
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-2 border-t pt-4">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function PlaceholderTab({ title, hint }: { title: string; hint: string }) {
  return (
    <Card><CardContent className="py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </CardContent></Card>
  );
}
