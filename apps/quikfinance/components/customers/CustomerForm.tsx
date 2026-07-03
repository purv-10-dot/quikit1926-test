"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReturnTo } from "@/lib/hooks/use-return-to";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Zap, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { useCurrencyOptions } from "@/lib/hooks/use-currency-options";
import { PageHeader } from "@/components/shared/PageHeader";
import { INDIAN_STATE_OPTIONS } from "@/lib/india";
import { COUNTRY_NAMES, dialForCountry } from "@/lib/phone";
import { PhoneInput } from "@/components/customers/PhoneInput";
import { cn } from "@/lib/utils/cn";

// Future ERP modules — flip on when those products ship.
const FEATURE_PROJECTS = true;

const TABS = [
  { key: "basic", label: "Basic" },
  { key: "addresses", label: "Addresses" },
  { key: "tax", label: "Tax & Compliance" },
  { key: "financials", label: "Financials" },
  { key: "contacts", label: "Contact Persons" },
  { key: "sales", label: "Sales Info" },
  { key: "banking", label: "Banking" },
  { key: "documents", label: "Documents" },
  { key: "custom", label: "Custom Fields" },
  { key: "portal", label: "Portal Access" },
  ...(FEATURE_PROJECTS ? [{ key: "projects", label: "Projects" }] : [])
] as const;

type TabKey = (typeof TABS)[number]["key"];
type Person = { id?: string; name: string; designation: string; department: string; email: string; mobile: string; whatsapp: string; is_primary: boolean; is_decision_maker: boolean };
type Bank = { id?: string; account_holder_name: string; bank_name: string; account_number: string; ifsc: string; branch: string; swift_code: string; upi_id: string };
type Doc = { id?: string; doc_type: string; file_name: string; storage_url: string; mime_type: string; size_bytes: number };
type CustomField = { label: string; value: string };
type Address = { line1: string; line2: string; city: string; state: string; state_code: string; country: string; postal_code: string; landmark: string; phone: string };

const emptyAddress = (): Address => ({ line1: "", line2: "", city: "", state: "", state_code: "", country: "India", postal_code: "", landmark: "", phone: "" });
const emptyPerson = (): Person => ({ name: "", designation: "", department: "", email: "", mobile: "", whatsapp: "", is_primary: false, is_decision_maker: false });
const emptyBank = (): Bank => ({ account_holder_name: "", bank_name: "", account_number: "", ifsc: "", branch: "", swift_code: "", upi_id: "" });

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const LANGUAGES = [{ v: "en", l: "English" }, { v: "hi", l: "Hindi" }];
const DOC_TYPES = [
  { v: "pan", l: "PAN Copy" }, { v: "gst_certificate", l: "GST Certificate" }, { v: "company_registration", l: "Company Registration" },
  { v: "agreement", l: "Signed Agreement" }, { v: "purchase_order", l: "Purchase Order" }, { v: "other", l: "Other" }
];

type FormState = {
  contact_kind: "business" | "individual";
  customer_category: "customer" | "vendor" | "customer_vendor";
  display_name: string; company_name: string; first_name: string; last_name: string;
  email: string; phone: string; mobile: string; website: string; customer_language: string; date_format: string; status: "active" | "inactive";
  tax_id: string; pan: string; tan: string; msme_number: string; cin_number: string; tax_category: string; tax_exempt: boolean;
  gst_treatment: string; state_code: string;
  currency: string; ar_account_id: string; payment_terms: number; credit_limit: string; credit_days: string; opening_balance: string; price_list: string; tds_applicable: boolean;
  billing_address: Address; shipping_address: Address; shipping_same: boolean;
  account_owner: string; salesperson: string; lead_source: string; customer_segment: string; territory: string; region: string; referral_partner: string;
  portal_enabled: boolean; portal_username: string; mfa_enabled: boolean;
  project_name: string; site_name: string; project_manager: string; contract_value: string; customer_since: string;
  notes: string;
  contacts_people: Person[]; bank_accounts: Bank[]; documents: Doc[]; custom_fields: CustomField[];
};

const initialState = (): FormState => ({
  contact_kind: "business", customer_category: "customer", display_name: "", company_name: "", first_name: "", last_name: "",
  email: "", phone: "", mobile: "", website: "", customer_language: "en", date_format: "", status: "active",
  tax_id: "", pan: "", tan: "", msme_number: "", cin_number: "", tax_category: "", tax_exempt: false, gst_treatment: "registered", state_code: "",
  currency: "INR", ar_account_id: "", payment_terms: 30, credit_limit: "", credit_days: "", opening_balance: "0", price_list: "", tds_applicable: false,
  billing_address: emptyAddress(), shipping_address: emptyAddress(), shipping_same: true,
  account_owner: "", salesperson: "", lead_source: "", customer_segment: "", territory: "", region: "", referral_partner: "",
  portal_enabled: false, portal_username: "", mfa_enabled: false,
  project_name: "", site_name: "", project_manager: "", contract_value: "", customer_since: "",
  notes: "", contacts_people: [], bank_accounts: [], documents: [], custom_fields: []
});

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(path);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

function Field({ label, required, error, children, hint }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}{required ? <span className="text-red-500"> *</span> : null}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && !error ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

export function CustomerForm({ customerId, kind = "customer" }: { customerId?: string; kind?: "customer" | "vendor" }) {
  const router = useRouter();
  const returnTo = useReturnTo();
  const isVendor = kind === "vendor";
  const noun = isVendor ? "vendor" : "customer";
  const apiBase = isVendor ? "/api/v1/vendors" : "/api/v1/customers";
  const listPath = isVendor ? "/vendors" : "/customers";
  const accountLabel = isVendor ? "Accounts Payable Account" : "Accounts Receivable Account";
  const isEdit = Boolean(customerId);
  const [quick, setQuick] = useState(!isEdit);
  const [tab, setTab] = useState<TabKey>("basic");
  const [form, setForm] = useState<FormState>(() => (isVendor ? { ...initialState(), customer_category: "vendor" } : initialState()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const draftKey = `${noun}-draft-${customerId ?? "new"}`;
  const hydrated = useRef(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setAddr = (which: "billing_address" | "shipping_address", key: keyof Address, value: string) =>
    setForm((f) => ({ ...f, [which]: { ...f[which], [key]: value } }));

  // Custom-field value helpers (keyed by label, stored in form.custom_fields).
  const getCF = (label: string) => form.custom_fields.find((c) => c.label === label)?.value ?? "";
  const setCF = (label: string, value: string) =>
    setForm((f) => {
      const exists = f.custom_fields.some((c) => c.label === label);
      const custom_fields = exists ? f.custom_fields.map((c) => (c.label === label ? { ...c, value } : c)) : [...f.custom_fields, { label, value }];
      return { ...f, custom_fields };
    });

  // Company country → default phone dial code.
  const { data: company } = useQuery({
    queryKey: ["company-summary"],
    queryFn: async () => {
      const r = await fetch("/api/v1/settings/company");
      if (!r.ok) return null;
      const payload = (await r.json()) as { data?: { country?: string } };
      return payload.data ?? null;
    }
  });
  const defaultDial = dialForCountry(company?.country);

  // Org customer/vendor settings (default type) + custom-field definitions.
  const { data: cvSettings } = useQuery({
    queryKey: ["cv-settings"],
    queryFn: async () => {
      const r = await fetch("/api/v1/settings/customers-vendors");
      return r.ok ? ((await r.json()).data as { default_customer_type?: "business" | "individual" }) : null;
    }
  });
  const { data: fieldDefs = [] } = useQuery({
    queryKey: ["cv-custom-fields-active"],
    queryFn: async () =>
      (await fetchList("/api/v1/settings/custom-fields?entity=contacts"))
        .filter((d) => String(d.status) === "active")
        .map((d) => ({ label: String(d.label), data_type: String(d.data_type), is_mandatory: Boolean(d.is_mandatory), options: Array.isArray(d.options) ? (d.options as string[]) : [] }))
  });
  const appliedDefaultType = useRef(false);
  useEffect(() => {
    if (isEdit || isVendor || appliedDefaultType.current || !cvSettings?.default_customer_type) return;
    appliedDefaultType.current = true;
    setForm((f) => ({ ...f, contact_kind: cvSettings.default_customer_type as FormState["contact_kind"] }));
  }, [cvSettings, isEdit, isVendor]);

  // Reference data — A/R accounts for customers, A/P accounts for vendors.
  const { data: arAccounts = [] } = useQuery({
    queryKey: ["party-accounts", kind],
    queryFn: async () => {
      const allowed = isVendor ? ["accounts_payable", "other_current_liability"] : ["accounts_receivable", "other_current_asset"];
      return (await fetchList("/api/v1/accounts?per_page=300"))
        .filter((r) => allowed.includes(String(r.account_type)))
        .map((r) => ({ id: String(r.id), label: `${r.code} · ${r.name}` }));
    }
  });

  // Hydrate on edit (or restore a draft on new).
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (customerId) {
      fetch(`${apiBase}/${customerId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((payload) => {
          const d = payload?.data;
          if (!d) return;
          setForm((f) => ({
            ...f,
            contact_kind: d.contact_kind ?? "business",
            customer_category: d.customer_category ?? "customer",
            display_name: d.display_name ?? "", company_name: d.company_name ?? "", first_name: d.first_name ?? "", last_name: d.last_name ?? "",
            email: d.email ?? "", phone: d.phone ?? "", mobile: d.mobile ?? "", website: d.website ?? "", customer_language: d.customer_language ?? "en", date_format: d.date_format ?? "", status: d.status ?? "active",
            tax_id: d.tax_id ?? "", pan: d.pan ?? "", tan: d.tan ?? "", msme_number: d.msme_number ?? "", cin_number: d.cin_number ?? "", tax_category: d.tax_category ?? "", tax_exempt: Boolean(d.tax_exempt),
            gst_treatment: d.gst_treatment ?? "registered", state_code: d.state_code ?? "",
            currency: d.currency ?? "INR", ar_account_id: (isVendor ? d.ap_account_id : d.ar_account_id) ?? "", payment_terms: Number(d.payment_terms ?? 30),
            credit_limit: d.credit_limit != null ? String(d.credit_limit) : "", credit_days: d.credit_days != null ? String(d.credit_days) : "",
            opening_balance: String(d.opening_balance ?? "0"), price_list: d.price_list ?? "", tds_applicable: Boolean(d.tds_applicable),
            billing_address: { ...emptyAddress(), ...(d.billing_address ?? {}) }, shipping_address: { ...emptyAddress(), ...(d.shipping_address ?? {}) }, shipping_same: false,
            account_owner: d.account_owner ?? "", salesperson: d.salesperson ?? "", lead_source: d.lead_source ?? "", customer_segment: d.customer_segment ?? "", territory: d.territory ?? "", region: d.region ?? "", referral_partner: d.referral_partner ?? "",
            portal_enabled: Boolean(d.portal_enabled), portal_username: d.portal_username ?? "", mfa_enabled: Boolean(d.mfa_enabled),
            project_name: d.project_name ?? "", site_name: d.site_name ?? "", project_manager: d.project_manager ?? "", contract_value: d.contract_value != null ? String(d.contract_value) : "", customer_since: d.customer_since ? String(d.customer_since).slice(0, 10) : "",
            notes: d.notes ?? "",
            contacts_people: (d.contacts_people ?? []).map((p: Record<string, unknown>) => ({ id: String(p.id), name: String(p.name ?? ""), designation: String(p.designation ?? ""), department: String(p.department ?? ""), email: String(p.email ?? ""), mobile: String(p.mobile ?? ""), whatsapp: String(p.whatsapp ?? ""), is_primary: Boolean(p.is_primary), is_decision_maker: Boolean(p.is_decision_maker) })),
            bank_accounts: (d.bank_accounts ?? []).map((b: Record<string, unknown>) => ({ id: String(b.id), account_holder_name: String(b.account_holder_name ?? ""), bank_name: String(b.bank_name ?? ""), account_number: "", ifsc: String(b.ifsc ?? ""), branch: String(b.branch ?? ""), swift_code: String(b.swift_code ?? ""), upi_id: String(b.upi_id ?? "") })),
            documents: (d.documents ?? []).map((doc: Record<string, unknown>) => ({ id: String(doc.id), doc_type: String(doc.doc_type ?? "other"), file_name: String(doc.file_name ?? ""), storage_url: String(doc.storage_url ?? ""), mime_type: String(doc.mime_type ?? ""), size_bytes: Number(doc.size_bytes ?? 0) })),
            custom_fields: Array.isArray(d.custom_fields) ? d.custom_fields.map((c: Record<string, unknown>) => ({ label: String(c.label ?? ""), value: String(c.value ?? "") })) : []
          }));
        });
    } else {
      const draft = typeof window !== "undefined" ? window.localStorage.getItem(draftKey) : null;
      if (draft) {
        try { setForm((f) => ({ ...f, ...JSON.parse(draft) })); toast.message("Draft restored"); } catch { /* ignore */ }
      }
    }
  }, [customerId, draftKey]);

  // Autosave draft (debounced) for new customers.
  useEffect(() => {
    if (isEdit || !hydrated.current) return;
    const handle = setTimeout(() => window.localStorage.setItem(draftKey, JSON.stringify(form)), 800);
    return () => clearTimeout(handle);
  }, [form, isEdit, draftKey]);

  // Auto display name suggestion.
  useEffect(() => {
    if (form.display_name) return;
    const suggestion = form.contact_kind === "business" ? form.company_name : `${form.first_name} ${form.last_name}`.trim();
    if (suggestion) set("display_name", suggestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.company_name, form.first_name, form.last_name, form.contact_kind]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.display_name.trim()) e.display_name = "Display name is required.";
    if (form.contact_kind === "business" && !form.company_name.trim()) e.company_name = "Company name is required.";
    if (form.contact_kind === "individual" && !form.first_name.trim()) e.first_name = "First name is required.";
    if (!form.mobile.trim()) e.mobile = "Mobile number is required.";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email.";
    let customFieldMissing = false;
    for (const def of fieldDefs) {
      if (def.is_mandatory && !getCF(def.label).trim()) { e[`cf:${def.label}`] = `${def.label} is required.`; customFieldMissing = true; }
    }
    setErrors(e);
    const basicError = Object.keys(e).some((k) => !k.startsWith("cf:"));
    if (basicError) { setQuick(true); setTab("basic"); }
    else if (customFieldMissing) { setQuick(false); setTab("custom"); }
    return Object.keys(e).length === 0;
  };

  const buildPayload = () => {
    const shipping = form.shipping_same ? form.billing_address : form.shipping_address;
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    return {
      contact_kind: form.contact_kind, customer_category: form.customer_category, display_name: form.display_name,
      company_name: form.company_name || null, first_name: form.first_name || null, last_name: form.last_name || null,
      email: form.email || null, phone: form.phone || null, mobile: form.mobile || null, website: form.website || null,
      customer_language: form.customer_language, date_format: form.date_format || null, status: form.status,
      tax_id: form.tax_id || "", pan: form.pan || "", tan: form.tan || "", msme_number: form.msme_number || "", cin_number: form.cin_number || "",
      tax_category: form.tax_category || null, tax_exempt: form.tax_exempt, gst_treatment: form.gst_treatment, state_code: form.state_code || "",
      currency: form.currency, ar_account_id: form.ar_account_id || null, payment_terms: form.payment_terms,
      credit_limit: num(form.credit_limit), credit_days: num(form.credit_days), opening_balance: num(form.opening_balance) ?? 0,
      price_list: form.price_list || null, tds_applicable: form.tds_applicable,
      billing_address: form.billing_address, shipping_address: shipping,
      account_owner: form.account_owner || null, salesperson: form.salesperson || null, lead_source: form.lead_source || null,
      customer_segment: form.customer_segment || null, territory: form.territory || null, region: form.region || null, referral_partner: form.referral_partner || null,
      portal_enabled: form.portal_enabled, portal_username: form.portal_username || null, mfa_enabled: form.mfa_enabled,
      project_name: form.project_name || null, site_name: form.site_name || null, project_manager: form.project_manager || null,
      contract_value: num(form.contract_value), customer_since: form.customer_since || null, notes: form.notes || null,
      contacts_people: form.contacts_people.filter((p) => p.name.trim()),
      bank_accounts: form.bank_accounts.filter((b) => b.bank_name.trim() || b.account_number.trim()),
      documents: form.documents.filter((d) => d.file_name.trim()),
      custom_fields: form.custom_fields.filter((c) => c.label.trim())
    };
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!validate()) { toast.error("Please fix the highlighted fields."); return; }
    setSubmitting(true);
    try {
      const response = await fetch(isEdit ? `${apiBase}/${customerId}` : apiBase, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload())
      });
      const body = (await response.json().catch(() => null)) as { data?: { id?: string }; error?: { message?: string; details?: { fieldErrors?: Record<string, string[]> } } } | null;
      if (!response.ok) {
        const fieldErrors = body?.error?.details?.fieldErrors;
        if (fieldErrors) {
          setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])));
          toast.error("Some fields need attention.");
        } else {
          toast.error(body?.error?.message ?? `Could not save the ${noun}.`);
        }
        return;
      }
      window.localStorage.removeItem(draftKey);
      toast.success(isEdit ? `${noun === "vendor" ? "Vendor" : "Customer"} updated.` : `${noun === "vendor" ? "Vendor" : "Customer"} created.`);
      const id = isEdit ? customerId : body?.data?.id;
      // When opened from a Combobox "+ New", go back to where it was opened from.
      if (returnTo) router.push(returnTo);
      else router.push(id ? `${listPath}/${id}` : listPath);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const stateOptions = useMemo(() => INDIAN_STATE_OPTIONS, []);

  // Currency lookup (Setup → Currencies) — drives the customer's default currency.
  const currencyOptions = useCurrencyOptions();

  return (
    <form onSubmit={submit} className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={isEdit ? `Edit ${noun}` : `New ${noun}`} description="Create in under 30 seconds with Quick Create, or open Advanced for full details." />
        <div className="flex items-center gap-2">
          {!isEdit ? (
            <Button type="button" variant={quick ? "primary" : "secondary"} size="sm" onClick={() => setQuick((q) => !q)}>
              <Zap className="mr-1 h-4 w-4" />{quick ? "Advanced" : "Quick Create"}
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={submitting}><Save className="mr-1 h-4 w-4" />{submitting ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      {quick && !isEdit ? (
        <Card>
          <CardHeader><CardTitle>Quick Create</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label={isVendor ? "Vendor Type" : "Customer Type"}>
              <select className={selectClass} value={form.contact_kind} onChange={(e) => set("contact_kind", e.target.value as FormState["contact_kind"])}>
                <option value="business">Business</option>
                <option value="individual">Individual</option>
              </select>
            </Field>
            <Field label="Category">
              <select className={selectClass} value={form.customer_category} onChange={(e) => set("customer_category", e.target.value as FormState["customer_category"])}>
                <option value="customer">Customer</option>
                <option value="vendor">Vendor</option>
                <option value="customer_vendor">Customer & Vendor</option>
              </select>
            </Field>
            <Field label={form.contact_kind === "business" ? "Company Name" : "Name"} required error={errors.company_name}>
              <Input value={form.contact_kind === "business" ? form.company_name : form.first_name}
                onChange={(e) => { if (form.contact_kind === "business") { set("company_name", e.target.value); } else { set("first_name", e.target.value); } if (!form.display_name) set("display_name", e.target.value); }} />
            </Field>
            <Field label="Display Name" required error={errors.display_name} hint="Shown on invoices and statements.">
              <Input value={form.display_name} onChange={(e) => set("display_name", e.target.value)} />
            </Field>
            <Field label="Mobile" required error={errors.mobile}>
              <PhoneInput value={form.mobile} defaultDial={defaultDial} onChange={(v) => set("mobile", v)} />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Currency"><Combobox value={form.currency} onChange={(v) => set("currency", v)} options={currencyOptions} placeholder="Select currency" searchPlaceholder="Search currencies…" /></Field>
          </CardContent>
        </Card>
      ) : (
        <>
          <div role="tablist" className="flex flex-wrap gap-1 border-b">
            {TABS.map((item) => (
              <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)}
                className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors", tab === item.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {item.label}
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="pt-6">
              {tab === "basic" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={isVendor ? "Vendor Type" : "Customer Type"}>
                    <select className={selectClass} value={form.contact_kind} onChange={(e) => set("contact_kind", e.target.value as FormState["contact_kind"])}>
                      <option value="business">Business</option><option value="individual">Individual</option>
                    </select>
                  </Field>
                  <Field label="Category">
                    <select className={selectClass} value={form.customer_category} onChange={(e) => set("customer_category", e.target.value as FormState["customer_category"])}>
                      <option value="customer">Customer</option><option value="vendor">Vendor</option><option value="customer_vendor">Customer & Vendor</option>
                    </select>
                  </Field>
                  {form.contact_kind === "business" ? (
                    <Field label="Company Name" required error={errors.company_name}><Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
                  ) : (
                    <>
                      <Field label="First Name" required error={errors.first_name}><Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} /></Field>
                      <Field label="Last Name"><Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} /></Field>
                    </>
                  )}
                  <Field label="Display Name" required error={errors.display_name}><Input value={form.display_name} onChange={(e) => set("display_name", e.target.value)} /></Field>
                  <Field label="Mobile" required error={errors.mobile}><PhoneInput value={form.mobile} defaultDial={defaultDial} onChange={(v) => set("mobile", v)} /></Field>
                  <Field label="Phone"><PhoneInput value={form.phone} defaultDial={defaultDial} onChange={(v) => set("phone", v)} placeholder="Landline / office" /></Field>
                  <Field label="Email" error={errors.email}><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
                  <Field label="Website"><Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></Field>
                  <Field label="Language">
                    <select className={selectClass} value={form.customer_language} onChange={(e) => set("customer_language", e.target.value)}>
                      {LANGUAGES.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select className={selectClass} value={form.status} onChange={(e) => set("status", e.target.value as FormState["status"])}>
                      <option value="active">Active</option><option value="inactive">Inactive</option>
                    </select>
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Notes"><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} /></Field>
                  </div>
                </div>
              ) : null}

              {tab === "addresses" ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  <AddressBlock title="Billing Address" addr={form.billing_address} states={stateOptions} defaultDial={defaultDial} onChange={(k, v) => setAddr("billing_address", k, v)} />
                  <div>
                    <label className="mb-3 flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={form.shipping_same} onChange={(e) => set("shipping_same", e.target.checked)} />
                      Shipping same as billing
                    </label>
                    {!form.shipping_same ? <AddressBlock title="Shipping Address" addr={form.shipping_address} states={stateOptions} defaultDial={defaultDial} onChange={(k, v) => setAddr("shipping_address", k, v)} /> : null}
                  </div>
                </div>
              ) : null}

              {tab === "tax" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="GSTIN" error={errors.tax_id} hint="Validated with check digit; state inferred."><Input value={form.tax_id} onChange={(e) => set("tax_id", e.target.value.toUpperCase())} /></Field>
                  <Field label="PAN" error={errors.pan} hint="ABCDE1234F"><Input value={form.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} /></Field>
                  <Field label="TAN" error={errors.tan} hint="ABCD12345E"><Input value={form.tan} onChange={(e) => set("tan", e.target.value.toUpperCase())} /></Field>
                  <Field label="MSME / Udyam" error={errors.msme_number} hint="UDYAM-MH-01-1234567"><Input value={form.msme_number} onChange={(e) => set("msme_number", e.target.value.toUpperCase())} /></Field>
                  <Field label="CIN" error={errors.cin_number}><Input value={form.cin_number} onChange={(e) => set("cin_number", e.target.value.toUpperCase())} /></Field>
                  <Field label="GST Treatment">
                    <select className={selectClass} value={form.gst_treatment} onChange={(e) => set("gst_treatment", e.target.value)}>
                      {["registered", "consumer", "unregistered", "sez", "overseas"].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Tax Category"><Input value={form.tax_category} onChange={(e) => set("tax_category", e.target.value)} /></Field>
                  <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={form.tax_exempt} onChange={(e) => set("tax_exempt", e.target.checked)} />Tax exempt</label>
                </div>
              ) : null}

              {tab === "financials" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Currency"><Combobox value={form.currency} onChange={(v) => set("currency", v)} options={currencyOptions} placeholder="Select currency" searchPlaceholder="Search currencies…" /></Field>
                  <Field label="Date Format (on PDFs)">
                    <select className={selectClass} value={form.date_format} onChange={(e) => set("date_format", e.target.value)}>
                      <option value="">Use organization default</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="DD-MMM-YYYY">DD-MMM-YYYY</option>
                      <option value="MMM DD, YYYY">MMM DD, YYYY</option>
                    </select>
                  </Field>
                  <Field label={accountLabel}>
                    <select className={selectClass} value={form.ar_account_id} onChange={(e) => set("ar_account_id", e.target.value)}>
                      <option value="">Default</option>
                      {arAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Payment Terms (days)"><Input type="number" value={form.payment_terms} onChange={(e) => set("payment_terms", Number(e.target.value))} /></Field>
                  <Field label="Credit Days"><Input type="number" value={form.credit_days} onChange={(e) => set("credit_days", e.target.value)} /></Field>
                  <Field label="Credit Limit"><Input type="number" value={form.credit_limit} onChange={(e) => set("credit_limit", e.target.value)} /></Field>
                  <Field label="Opening Balance"><Input type="number" value={form.opening_balance} onChange={(e) => set("opening_balance", e.target.value)} /></Field>
                  <Field label="Price List"><Input value={form.price_list} onChange={(e) => set("price_list", e.target.value)} /></Field>
                  <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={form.tds_applicable} onChange={(e) => set("tds_applicable", e.target.checked)} />TDS applicable</label>
                </div>
              ) : null}

              {tab === "contacts" ? (
                <div className="space-y-3">
                  {form.contacts_people.map((p, i) => (
                    <div key={i} className="grid gap-2 rounded-md border p-3 md:grid-cols-3">
                      <Input placeholder="Name" value={p.name} onChange={(e) => updateRow(setForm, "contacts_people", i, { name: e.target.value })} />
                      <Input placeholder="Designation" value={p.designation} onChange={(e) => updateRow(setForm, "contacts_people", i, { designation: e.target.value })} />
                      <Input placeholder="Department" value={p.department} onChange={(e) => updateRow(setForm, "contacts_people", i, { department: e.target.value })} />
                      <Input placeholder="Email" value={p.email} onChange={(e) => updateRow(setForm, "contacts_people", i, { email: e.target.value })} />
                      <PhoneInput value={p.mobile} defaultDial={defaultDial} placeholder="Mobile" onChange={(v) => updateRow(setForm, "contacts_people", i, { mobile: v })} />
                      <PhoneInput value={p.whatsapp} defaultDial={defaultDial} placeholder="WhatsApp" onChange={(v) => updateRow(setForm, "contacts_people", i, { whatsapp: v })} />
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={p.is_primary} onChange={(e) => updateRow(setForm, "contacts_people", i, { is_primary: e.target.checked })} />Primary</label>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={p.is_decision_maker} onChange={(e) => updateRow(setForm, "contacts_people", i, { is_decision_maker: e.target.checked })} />Decision maker</label>
                      <Button type="button" variant="ghost" size="sm" className="justify-self-end px-2" onClick={() => removeRow(setForm, "contacts_people", i)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" size="sm" onClick={() => set("contacts_people", [...form.contacts_people, emptyPerson()])}><Plus className="mr-1 h-4 w-4" />Add contact</Button>
                </div>
              ) : null}

              {tab === "sales" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Account Owner"><Input value={form.account_owner} onChange={(e) => set("account_owner", e.target.value)} /></Field>
                  <Field label="Salesperson"><Input value={form.salesperson} onChange={(e) => set("salesperson", e.target.value)} /></Field>
                  <Field label="Lead Source"><Input value={form.lead_source} onChange={(e) => set("lead_source", e.target.value)} /></Field>
                  <Field label="Customer Segment"><Input value={form.customer_segment} onChange={(e) => set("customer_segment", e.target.value)} /></Field>
                  <Field label="Territory"><Input value={form.territory} onChange={(e) => set("territory", e.target.value)} /></Field>
                  <Field label="Region"><Input value={form.region} onChange={(e) => set("region", e.target.value)} /></Field>
                  <Field label="Referral Partner"><Input value={form.referral_partner} onChange={(e) => set("referral_partner", e.target.value)} /></Field>
                </div>
              ) : null}

              {tab === "banking" ? (
                <div className="space-y-3">
                  {form.bank_accounts.map((b, i) => (
                    <div key={i} className="grid gap-2 rounded-md border p-3 md:grid-cols-3">
                      <Input placeholder="Account holder" value={b.account_holder_name} onChange={(e) => updateRow(setForm, "bank_accounts", i, { account_holder_name: e.target.value })} />
                      <Input placeholder="Bank name" value={b.bank_name} onChange={(e) => updateRow(setForm, "bank_accounts", i, { bank_name: e.target.value })} />
                      <Input placeholder={b.id ? "Account number (hidden — re-enter to change)" : "Account number"} value={b.account_number} onChange={(e) => updateRow(setForm, "bank_accounts", i, { account_number: e.target.value })} />
                      <Input placeholder="IFSC" value={b.ifsc} onChange={(e) => updateRow(setForm, "bank_accounts", i, { ifsc: e.target.value.toUpperCase() })} />
                      <Input placeholder="Branch" value={b.branch} onChange={(e) => updateRow(setForm, "bank_accounts", i, { branch: e.target.value })} />
                      <Input placeholder="SWIFT" value={b.swift_code} onChange={(e) => updateRow(setForm, "bank_accounts", i, { swift_code: e.target.value.toUpperCase() })} />
                      <Input placeholder="UPI ID" value={b.upi_id} onChange={(e) => updateRow(setForm, "bank_accounts", i, { upi_id: e.target.value })} />
                      <Button type="button" variant="ghost" size="sm" className="justify-self-end px-2" onClick={() => removeRow(setForm, "bank_accounts", i)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" size="sm" onClick={() => set("bank_accounts", [...form.bank_accounts, emptyBank()])}><Plus className="mr-1 h-4 w-4" />Add bank account</Button>
                  <p className="text-xs text-muted-foreground">Account numbers are encrypted at rest (AES-256-GCM) and shown masked after saving.</p>
                </div>
              ) : null}

              {tab === "documents" ? (
                <div className="space-y-3">
                  {form.documents.map((d, i) => (
                    <div key={i} className="grid items-center gap-2 rounded-md border p-3 md:grid-cols-[180px_1fr_1fr_40px]">
                      <select className={selectClass} value={d.doc_type} onChange={(e) => updateRow(setForm, "documents", i, { doc_type: e.target.value })}>
                        {DOC_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                      </select>
                      <Input type="file" onChange={(e) => { const file = e.target.files?.[0]; if (file) { if (file.size > 26_214_400) { toast.error("Max 25 MB per file."); return; } updateRow(setForm, "documents", i, { file_name: file.name, mime_type: file.type, size_bytes: file.size }); } }} />
                      <Input placeholder="Storage URL (optional)" value={d.storage_url} onChange={(e) => updateRow(setForm, "documents", i, { storage_url: e.target.value })} />
                      <Button type="button" variant="ghost" size="sm" className="px-2" onClick={() => removeRow(setForm, "documents", i)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  {form.documents.length < 20 ? <Button type="button" variant="secondary" size="sm" onClick={() => set("documents", [...form.documents, { doc_type: "other", file_name: "", storage_url: "", mime_type: "", size_bytes: 0 }])}><Plus className="mr-1 h-4 w-4" />Add document</Button> : null}
                  <p className="text-xs text-muted-foreground">Up to 20 files, 25 MB each. File metadata is recorded; wire object storage to persist binaries.</p>
                </div>
              ) : null}

              {tab === "custom" ? (
                <div className="space-y-4">
                  {fieldDefs.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {fieldDefs.map((def) => (
                        <Field key={def.label} label={def.label} required={def.is_mandatory} error={errors[`cf:${def.label}`]}>
                          {def.data_type === "dropdown" ? (
                            <select className={selectClass} value={getCF(def.label)} onChange={(e) => setCF(def.label, e.target.value)}>
                              <option value="">Select…</option>
                              {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : def.data_type === "checkbox" ? (
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={getCF(def.label) === "true"} onChange={(e) => setCF(def.label, e.target.checked ? "true" : "")} />Yes</label>
                          ) : def.data_type === "multiline" ? (
                            <Textarea value={getCF(def.label)} onChange={(e) => setCF(def.label, e.target.value)} rows={2} />
                          ) : (
                            <Input
                              type={def.data_type === "number" || def.data_type === "amount" || def.data_type === "percent" ? "number" : def.data_type === "date" ? "date" : def.data_type === "email" ? "email" : def.data_type === "url" ? "url" : "text"}
                              value={getCF(def.label)}
                              onChange={(e) => setCF(def.label, e.target.value)}
                            />
                          )}
                        </Field>
                      ))}
                    </div>
                  ) : null}

                  {fieldDefs.length > 0 ? <p className="border-t pt-3 text-xs font-medium uppercase text-muted-foreground">Additional ad-hoc fields</p> : null}
                  {form.custom_fields.filter((c) => !fieldDefs.some((d) => d.label === c.label)).length === 0 && fieldDefs.length === 0 ? <p className="text-sm text-muted-foreground">Add your own fields, or define reusable fields in Settings → Customers &amp; Vendors → Field Customization.</p> : null}
                  {form.custom_fields.map((c, i) => ({ c, i })).filter(({ c }) => !fieldDefs.some((d) => d.label === c.label)).map(({ c, i }) => (
                    <div key={i} className="grid items-center gap-2 md:grid-cols-[1fr_1.4fr_40px]">
                      <Input placeholder="Field label" value={c.label} onChange={(e) => setForm((f) => ({ ...f, custom_fields: f.custom_fields.map((row, idx) => (idx === i ? { ...row, label: e.target.value } : row)) }))} />
                      <Input placeholder="Value" value={c.value} onChange={(e) => setForm((f) => ({ ...f, custom_fields: f.custom_fields.map((row, idx) => (idx === i ? { ...row, value: e.target.value } : row)) }))} />
                      <Button type="button" variant="ghost" size="sm" className="px-2" onClick={() => setForm((f) => ({ ...f, custom_fields: f.custom_fields.filter((_, idx) => idx !== i) }))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" size="sm" onClick={() => set("custom_fields", [...form.custom_fields, { label: "", value: "" }])}><Plus className="mr-1 h-4 w-4" />Add field</Button>
                </div>
              ) : null}

              {tab === "portal" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={form.portal_enabled} onChange={(e) => set("portal_enabled", e.target.checked)} />Portal enabled</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={form.mfa_enabled} onChange={(e) => set("mfa_enabled", e.target.checked)} />MFA enabled</label>
                  <Field label="Portal Username"><Input value={form.portal_username} onChange={(e) => set("portal_username", e.target.value)} /></Field>
                  <div className="self-end"><Button type="button" variant="secondary" size="sm" disabled={!form.portal_enabled} onClick={() => toast.success("Invitation queued (wire your mailer to send).")}>Send invitation</Button></div>
                </div>
              ) : null}

              {tab === "projects" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Project Name"><Input value={form.project_name} onChange={(e) => set("project_name", e.target.value)} /></Field>
                  <Field label="Site Name"><Input value={form.site_name} onChange={(e) => set("site_name", e.target.value)} /></Field>
                  <Field label="Project Manager"><Input value={form.project_manager} onChange={(e) => set("project_manager", e.target.value)} /></Field>
                  <Field label="Contract Value"><Input type="number" value={form.contract_value} onChange={(e) => set("contract_value", e.target.value)} /></Field>
                  <Field label="Customer Since"><Input type="date" value={form.customer_since} onChange={(e) => set("customer_since", e.target.value)} /></Field>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.push(listPath)}>Cancel</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : isEdit ? `Update ${noun}` : `Create ${noun}`}</Button>
      </div>
    </form>
  );
}

function AddressBlock({ title, addr, states, defaultDial, onChange }: { title: string; addr: Address; states: readonly { readonly label: string; readonly value: string }[]; defaultDial: string; onChange: (k: keyof Address, v: string) => void }) {
  const isIndia = !addr.country || addr.country.toLowerCase() === "india";
  const knownState = states.find((s) => s.label === addr.state || s.value === addr.state_code);
  const [customState, setCustomState] = useState<boolean>(isIndia && Boolean(addr.state) && !knownState);
  const countryOptions = !addr.country || COUNTRY_NAMES.includes(addr.country) ? COUNTRY_NAMES : [addr.country, ...COUNTRY_NAMES];

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{title}</p>
      <Input placeholder="Address line 1" value={addr.line1} onChange={(e) => onChange("line1", e.target.value)} />
      <Input placeholder="Address line 2" value={addr.line2} onChange={(e) => onChange("line2", e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="City" value={addr.city} onChange={(e) => onChange("city", e.target.value)} />
        {isIndia && !customState ? (
          <select className={selectClass} value={knownState?.value ?? ""} onChange={(e) => {
            if (e.target.value === "__other__") { setCustomState(true); onChange("state_code", ""); onChange("state", ""); return; }
            const opt = states.find((s) => s.value === e.target.value);
            onChange("state_code", e.target.value); onChange("state", opt?.label ?? "");
          }}>
            <option value="">State</option>
            {states.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            <option value="__other__">Other (type manually)</option>
          </select>
        ) : (
          <div className="flex gap-1">
            <Input placeholder="State" value={addr.state} onChange={(e) => { onChange("state", e.target.value); onChange("state_code", ""); }} />
            {isIndia ? <Button type="button" variant="ghost" size="sm" className="shrink-0 px-2 text-xs" onClick={() => { setCustomState(false); onChange("state", ""); }}>List</Button> : null}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className={selectClass} value={addr.country} onChange={(e) => onChange("country", e.target.value)}>
          <option value="">Country</option>
          {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Input placeholder="Postal code" value={addr.postal_code} onChange={(e) => onChange("postal_code", e.target.value)} />
      </div>
      <Input placeholder="Landmark" value={addr.landmark} onChange={(e) => onChange("landmark", e.target.value)} />
      <div>
        <Label className="text-xs">Phone</Label>
        <div className="mt-1"><PhoneInput value={addr.phone} defaultDial={defaultDial} onChange={(v) => onChange("phone", v)} placeholder="Address phone" /></div>
      </div>
    </div>
  );
}

// Helpers for dynamic row arrays.
function updateRow(setForm: React.Dispatch<React.SetStateAction<FormState>>, key: "contacts_people" | "bank_accounts" | "documents", index: number, patch: Record<string, unknown>) {
  setForm((f) => ({ ...f, [key]: (f[key] as Record<string, unknown>[]).map((row, i) => (i === index ? { ...row, ...patch } : row)) }) as FormState);
}
function removeRow(setForm: React.Dispatch<React.SetStateAction<FormState>>, key: "contacts_people" | "bank_accounts" | "documents", index: number) {
  setForm((f) => ({ ...f, [key]: (f[key] as unknown[]).filter((_, i) => i !== index) }) as FormState);
}
