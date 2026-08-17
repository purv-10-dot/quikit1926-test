"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, ApiError } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Building2, Save, Upload, Globe, Mail, Phone, MapPin, Landmark, Trash2, RefreshCw, RotateCcw, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";
import { withBasePath } from "@/lib/utils/base-path";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { useToast } from "@/components/hrms/toast";
import { PAN_PATTERN, TAN_PATTERN, GSTIN_PATTERN, CIN_PATTERN, ID_TITLES } from "@/lib/validations/identifiers";

interface CompanySettings {
  id: string;
  companyName: string;
  legalName: string | null;
  logo: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  tan: string | null;
  tdsCircleCodeArea: string | null;
  tdsCircleCodeType: string | null;
  tdsCircleNumber: string | null;
  tdsCircleSubNumber: string | null;
  timezone: string;
  dateFormat: string;
  currency: string;
  fiscalYearStart: number;
  workWeek: string[] | null;
  workHoursPerDay: number | string;
  candidateCoolingMonths: number | null;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIMEZONES = ["Asia/Kolkata", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Dubai", "Asia/Singapore", "UTC"];
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];
const COUNTRIES = ["India", "United States", "United Kingdom", "United Arab Emirates", "Singapore", "Germany", "Australia", "Canada"];
const MONTHS = [
  { v: 1, n: "January" }, { v: 2, n: "February" }, { v: 3, n: "March" }, { v: 4, n: "April" },
  { v: 5, n: "May" }, { v: 6, n: "June" }, { v: 7, n: "July" }, { v: 8, n: "August" },
  { v: 9, n: "September" }, { v: 10, n: "October" }, { v: 11, n: "November" }, { v: 12, n: "December" },
];

export default function CompanySettingsPage() {
  return (
    <Suspense fallback={<div className="p-4 space-y-2"><SkeletonLine w="40%" h={16} /><SkeletonLine w="70%" h={12} /><SkeletonLine w="60%" h={12} /></div>}>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <CompanySettingsPageInner />
    </Suspense>
  );
}

function CompanySettingsPageInner() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [form, setForm] = useState<Partial<CompanySettings>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "company"],
    queryFn: () => api.get<CompanySettings>("/api/v1/hrms/settings/company"),
  });

  const normalizeFromServer = (d: CompanySettings): CompanySettings => ({
    ...d,
    workWeek: d.workWeek ?? DAYS.slice(0, 5),
    workHoursPerDay: typeof d.workHoursPerDay === "string" ? parseFloat(d.workHoursPerDay) : d.workHoursPerDay,
  });

  useEffect(() => {
    if (data?.data) setForm(normalizeFromServer(data.data));
  }, [data]);

  const handleDiscard = () => {
    if (data?.data) setForm(normalizeFromServer(data.data));
    setSaveErr(null);
    setFieldErrors({});
    setSaved(false);
  };

  const saveMut = useMutation({
    mutationFn: (body: Partial<CompanySettings>) => api.put("/api/v1/hrms/settings/company", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "company"] });
      setSaveErr(null);
      setFieldErrors({});
      setSaved(true);
      toast.success("Company settings saved", "Your changes have been updated successfully.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      // Honour an explicit ?returnTo, otherwise go back to the Settings hub
      // after briefly showing the "Saved" confirmation.
      const dest = returnTo?.startsWith("/") ? returnTo : "/settings";
      setTimeout(() => router.push(dest), 800);
    },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => {
      if (e instanceof ApiError) {
        setSaveErr(e.message);
        setFieldErrors((e.details as Record<string, string[]>) ?? {});
      } else {
        setSaveErr(e.message);
        setFieldErrors({});
      }
      setSaved(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const logoUploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.upload<{ url: string }>("/api/v1/hrms/uploads", fd);
      await api.patch("/api/v1/hrms/settings/company", { logo: res.data.url });
      return res;
    },
    onSuccess: (res) => {
      setForm((p) => ({ ...p, logo: res.data.url }));
      setUploadError(null);
      qc.invalidateQueries({ queryKey: ["settings", "company"] });
    },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setUploadError(e.message),
  });

  const logoRemoveMut = useMutation({
    mutationFn: () => api.patch("/api/v1/hrms/settings/company", { logo: null }),
    onSuccess: () => {
      setForm((p) => ({ ...p, logo: null }));
      setUploadError(null);
      qc.invalidateQueries({ queryKey: ["settings", "company"] });
    },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setUploadError(e.message),
  });

  const toggleDay = (day: string) => {
    const current = form.workWeek ?? [];
    setForm({ ...form, workWeek: current.includes(day) ? current.filter((d) => d !== day) : [...current, day] });
  };

  if (isLoading) return (
    <div className="p-8 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="70%" h={12} />
      <SkeletonLine w="60%" h={12} />
    </div>
  );

  return (
    <div className="w-full">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Company Settings</h1>
        <p className="text-xs text-gray-500 mt-0.5">Manage your organization&apos;s information and preferences</p>
      </div>

      {saved && (
        <div className="mb-4 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
          <CheckCircle2 size={16} /> Company settings saved successfully
        </div>
      )}
      {saveErr && (
        <div className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 space-y-1">
          <p className="font-medium">{saveErr}</p>
          {Object.entries(fieldErrors).length > 0 && (
            <ul className="list-disc list-inside text-xs">
              {Object.entries(fieldErrors).map(([field, msgs]) => (
                <li key={field}><strong>{field}:</strong> {(msgs as string[]).join(", ")}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const required: Record<string, string[]> = {};
          if (!form.companyName?.trim()) required.companyName = ["Company name is required"];
          if (!form.email?.trim()) required.email = ["Company email is required"];
          if (!form.addressLine1?.trim()) required.addressLine1 = ["Address is required"];
          if (!form.city?.trim()) required.city = ["City is required"];
          if (!form.state?.trim()) required.state = ["State is required"];
          if (!form.pan?.trim()) required.pan = ["Company PAN is required"];
          if (Object.keys(required).length > 0) {
            setSaveErr("Please fill all required fields");
            setFieldErrors(required);
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
          }
          if (!form.cin?.trim() && !form.gstin?.trim()) {
            setSaveErr("At least one of CIN or GSTIN is required");
            setFieldErrors({ cin: ["Provide CIN or GSTIN"] });
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
          }
          saveMut.mutate({
            companyName: form.companyName,
            legalName: form.legalName || null,
            logo: form.logo || null,
            website: form.website || null,
            email: form.email || "",
            phone: form.phone || null,
            addressLine1: form.addressLine1 || "",
            addressLine2: form.addressLine2 || null,
            city: form.city || "",
            state: form.state || "",
            country: form.country || null,
            postalCode: form.postalCode || null,
            gstin: form.gstin || null,
            pan: form.pan || "",
            cin: form.cin || null,
            tan: form.tan || null,
            tdsCircleCodeArea: form.tdsCircleCodeArea || null,
            tdsCircleCodeType: form.tdsCircleCodeType || null,
            tdsCircleNumber: form.tdsCircleNumber || null,
            tdsCircleSubNumber: form.tdsCircleSubNumber || null,
            timezone: form.timezone,
            dateFormat: form.dateFormat,
            currency: form.currency,
            fiscalYearStart: form.fiscalYearStart,
            workWeek: form.workWeek,
            workHoursPerDay: Number(form.workHoursPerDay),
            candidateCoolingMonths: form.candidateCoolingMonths ?? null,
          });
        }}
        className="space-y-4"
      >
        {/* Company Information */}
        <Section title="Company Information" description="Basic details about your organization" icon={<Building2 size={16} />}>
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-56">
              <label className="block text-xs font-medium text-gray-600 mb-2">Company Logo</label>
              <input ref={logoInputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) logoUploadMut.mutate(f); e.target.value = ""; }} />

              {form.logo ? (
                <div>
                  <div className="relative w-full h-28 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={withBasePath(form.logo)} alt="Logo" className="w-full h-full object-contain p-2" />
                    {logoUploadMut.isPending && (
                      <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center">
                        <RefreshCw size={18} className="text-[#22c55e] animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoUploadMut.isPending}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-semibold shadow-sm transition disabled:opacity-60">
                      <RefreshCw size={12} /> Replace
                    </button>
                    <button type="button" onClick={() => logoRemoveMut.mutate()} disabled={logoRemoveMut.isPending}
                      title="Remove logo"
                      className="inline-flex items-center justify-center p-1.5 bg-white border border-[var(--border)] hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-gray-600 rounded-md transition disabled:opacity-60">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoUploadMut.isPending}
                  className="group w-full h-28 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-[#22c55e] hover:bg-[#dcfce7]/40 hover:text-[#16a34a] transition disabled:opacity-60">
                  {logoUploadMut.isPending ? <RefreshCw size={20} className="animate-spin" /> : <Upload size={20} />}
                  <span className="text-xs font-medium">{logoUploadMut.isPending ? "Uploading..." : "Upload logo"}</span>
                  <span className="text-[10px] text-gray-400">PNG, JPG, WEBP (Max 4MB)</span>
                </button>
              )}
              {uploadError && (
                <p className="mt-2 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1">{uploadError}</p>
              )}
            </div>

            <div className="flex-1 grid grid-cols-2 xl:grid-cols-3 gap-3">
              <Field label="Company Name" required>
                <input type="text" value={form.companyName ?? ""} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required className={inputCls} />
              </Field>
              <Field label="Legal Name">
                <input type="text" value={form.legalName ?? ""} onChange={(e) => setForm({ ...form, legalName: e.target.value })} placeholder="Registered entity name" className={inputCls} />
              </Field>
              <Field label="Website" icon={<Globe size={12} />}>
                <input type="url" value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" className={inputCls} />
              </Field>
              <Field label="Email" icon={<Mail size={12} />} required>
                <input type="email" required value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="hello@company.com" className={inputCls} />
              </Field>
              <Field label="Phone" icon={<Phone size={12} />}>
                <input type="tel" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
              </Field>
            </div>
          </div>
        </Section>

        {/* Address */}
        <Section title="Registered Address" description="Your registered office address" icon={<MapPin size={16} />}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Address Line 1" required>
              <input type="text" value={form.addressLine1 ?? ""} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} required className={inputCls} />
            </Field>
            <Field label="Address Line 2">
              <input type="text" value={form.addressLine2 ?? ""} onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} className={inputCls} />
            </Field>
            <Field label="City" required>
              <input type="text" required value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Postal Code">
              <input type="text" value={form.postalCode ?? ""} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} className={inputCls} />
            </Field>
            <Field label="State / Province" required>
              <input type="text" required value={form.state ?? ""} onChange={(e) => setForm({ ...form, state: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Country" required>
              <Select
                value={form.country ?? "India"}
                onChange={(v) => setForm({ ...form, country: v })}
                searchable
                options={COUNTRIES.map((c) => ({ value: c, label: c }))}
              />
            </Field>
          </div>
        </Section>

        {/* Statutory */}
        <Section title="Statutory Information" description="Tax and statutory details" icon={<Landmark size={16} />}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="GSTIN" required>
              <input
                type="text"
                value={form.gstin ?? ""}
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                maxLength={15}
                placeholder="27ABCDE1234F1Z5"
                pattern={GSTIN_PATTERN}
                title={ID_TITLES.gstin}
                className={clsx(inputCls, "font-mono tracking-wider")}
              />
            </Field>
            <Field label="PAN" required>
              <input
                type="text"
                required
                value={form.pan ?? ""}
                onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                maxLength={10}
                placeholder="ABCDE1234F"
                pattern={PAN_PATTERN}
                title={ID_TITLES.pan}
                className={clsx(inputCls, "font-mono tracking-wider")}
              />
            </Field>
            <Field label="CIN" required>
              <input
                type="text"
                value={form.cin ?? ""}
                onChange={(e) => setForm({ ...form, cin: e.target.value.toUpperCase() })}
                maxLength={21}
                placeholder="U72200KA2010PTC012345"
                pattern={CIN_PATTERN}
                title={ID_TITLES.cin}
                className={clsx(inputCls, "font-mono tracking-wider")}
              />
            </Field>
            <Field label="TAN" required>
              <input
                type="text"
                required
                value={form.tan ?? ""}
                onChange={(e) => setForm({ ...form, tan: e.target.value.toUpperCase() })}
                maxLength={10}
                placeholder="ABCD12345E"
                pattern={TAN_PATTERN}
                title={ID_TITLES.tan}
                className={clsx(inputCls, "font-mono tracking-wider")}
              />
            </Field>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              TDS Circle / AO Code
            </label>
            <div className="grid grid-cols-4 gap-2 max-w-md">
              <input
                placeholder="AAA" maxLength={3}
                value={form.tdsCircleCodeArea ?? ""}
                onChange={(e) => setForm({ ...form, tdsCircleCodeArea: e.target.value.toUpperCase() })}
                className={clsx(inputCls, "font-mono tracking-wider uppercase")}
              />
              <input
                placeholder="AA" maxLength={2}
                value={form.tdsCircleCodeType ?? ""}
                onChange={(e) => setForm({ ...form, tdsCircleCodeType: e.target.value.toUpperCase() })}
                className={clsx(inputCls, "font-mono tracking-wider uppercase")}
              />
              <input
                placeholder="000" maxLength={3}
                value={form.tdsCircleNumber ?? ""}
                onChange={(e) => setForm({ ...form, tdsCircleNumber: e.target.value })}
                className={clsx(inputCls, "font-mono tracking-wider")}
              />
              <input
                placeholder="00" maxLength={2}
                value={form.tdsCircleSubNumber ?? ""}
                onChange={(e) => setForm({ ...form, tdsCircleSubNumber: e.target.value })}
                className={clsx(inputCls, "font-mono tracking-wider")}
              />
            </div>
          </div>
        </Section>

        {/* Locale & Work */}
        <Section title="Locale & Work Settings" description="Define your work preferences" icon={<Globe size={16} />}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Field label="Timezone">
              <Select
                value={form.timezone ?? "Asia/Kolkata"}
                onChange={(v) => setForm({ ...form, timezone: v })}
                searchable
                options={TIMEZONES.map((t) => ({ value: t, label: t }))}
              />
            </Field>
            <Field label="Currency">
              <Select
                value={form.currency ?? "INR"}
                onChange={(v) => setForm({ ...form, currency: v })}
                searchable
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </Field>
            <Field label="Fiscal Year Start">
              <Select
                value={String(form.fiscalYearStart ?? 4)}
                onChange={(v) => setForm({ ...form, fiscalYearStart: Number(v) })}
                options={MONTHS.map((m) => ({ value: String(m.v), label: m.n }))}
              />
            </Field>
            <Field label="Work Hours / Day">
              <NumberInput step="0.5" min={1} max={24} value={typeof form.workHoursPerDay === "string" ? Number(form.workHoursPerDay) || null : (form.workHoursPerDay ?? 8)}
                onChange={(v) => setForm({ ...form, workHoursPerDay: v ?? 8 })} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <Field label="Candidate Re-apply Cooling Period" required>
              <Select
                value={String(form.candidateCoolingMonths ?? 0)}
                onChange={(v) => setForm({ ...form, candidateCoolingMonths: Number(v) || null })}
                options={[
                  { value: "0", label: "No cooling period" },
                  { value: "3", label: "3 months" },
                  { value: "6", label: "6 months" },
                  { value: "12", label: "12 months" },
                ]}
              />
            </Field>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Working Days</label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => {
                  const active = form.workWeek?.includes(d);
                  return (
                    <button type="button" key={d} onClick={() => toggleDay(d)}
                      className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium border transition",
                        active ? "bg-green-600 text-white border-[#22c55e]" : "bg-white text-gray-700 border-gray-300 hover:border-[#86efac]")}>
                      {d.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Section>

        <div className="flex justify-between items-center pt-2">
          <button type="button" onClick={handleDiscard} disabled={saveMut.isPending}
            className="flex items-center gap-2 bg-white text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
            <RotateCcw size={13} /> Discard Changes
          </button>
          <button type="submit" disabled={saveMut.isPending}
            className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
            <Save size={13} /> {saveMut.isPending ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls = "w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]";

function Section({
  title, description, icon, children,
}: { title: string; description?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-start gap-3 mb-4">
        <span className="shrink-0 w-9 h-9 rounded-xl bg-[#dcfce7] text-[#16a34a] flex items-center justify-center">
          {icon}
        </span>
        <div>
          <h2 className="text-[13px] font-semibold text-gray-900">{title}</h2>
          {description && <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({
  label, required, icon, children, className,
}: { label: string; required?: boolean; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
        {icon && <span className="text-gray-400">{icon}</span>}
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
