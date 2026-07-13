"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Globe2, ImagePlus, ListPlus, Mail, MapPin, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencySelect } from "@/components/shared/CurrencySelect";
import { COUNTRY_OPTIONS, getCityOptions, getStateOptions } from "@/lib/geo";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";

type CompanyValues = {
  name: string;
  industry: string;
  country: string;
  logo_url: string;
  address_line: string;
  street1: string;
  street2: string;
  state_code: string;
  city: string;
  pin_code: string;
  phone: string;
  fax: string;
  address_format: string;
  website: string;
  use_payment_address: boolean;
  payment_address: string;
  primary_contact_name: string;
  sender_email: string;
  email: string;
  base_currency: string;
  fiscal_year_start: string;
  report_basis: "accrual" | "cash";
  preferred_language: "en" | "hi";
  communication_language: "en" | "hi";
  timezone: string;
  date_format: string;
  default_upi_id: string;
};

type CustomField = { label: string; value: string };

const DEFAULTS: CompanyValues = {
  name: "",
  industry: "",
  country: "IN",
  logo_url: "",
  address_line: "",
  street1: "",
  street2: "",
  state_code: "",
  city: "",
  pin_code: "",
  phone: "",
  fax: "",
  address_format: "",
  website: "",
  use_payment_address: false,
  payment_address: "",
  primary_contact_name: "",
  sender_email: "",
  email: "",
  base_currency: "INR",
  fiscal_year_start: "4",
  report_basis: "accrual",
  preferred_language: "en",
  communication_language: "en",
  timezone: "Asia/Kolkata",
  date_format: "DD/MM/YYYY",
  default_upi_id: ""
};

const INDUSTRIES = [
  "Agency or Sales House",
  "Consulting",
  "E-commerce",
  "Education",
  "Financial Services",
  "Healthcare",
  "Information Technology",
  "Manufacturing",
  "Professional Services",
  "Real Estate",
  "Retail",
  "Transportation",
  "Other"
];

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"];
const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD-MMM-YYYY"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/bmp"];
const MAX_LOGO_BYTES = 1024 * 1024; // 1MB

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function toFormValues(data: Record<string, unknown> | undefined): CompanyValues {
  if (!data) return DEFAULTS;
  const pick = (key: keyof CompanyValues, fallback = "") => {
    const value = data[key];
    return value === null || value === undefined ? fallback : String(value);
  };
  return {
    ...DEFAULTS,
    name: pick("name"),
    industry: pick("industry"),
    country: pick("country", "IN"),
    logo_url: pick("logo_url"),
    address_line: pick("address_line"),
    street1: pick("street1"),
    street2: pick("street2"),
    state_code: pick("state_code"),
    city: pick("city"),
    pin_code: pick("pin_code"),
    phone: pick("phone"),
    fax: pick("fax"),
    address_format: pick("address_format"),
    website: pick("website"),
    use_payment_address: Boolean(data.use_payment_address),
    payment_address: pick("payment_address"),
    primary_contact_name: pick("primary_contact_name"),
    sender_email: pick("sender_email"),
    email: pick("email"),
    base_currency: pick("base_currency", "INR"),
    fiscal_year_start: pick("fiscal_year_start", "4"),
    report_basis: data.report_basis === "cash" ? "cash" : "accrual",
    preferred_language: data.preferred_language === "hi" ? "hi" : "en",
    communication_language: data.communication_language === "hi" ? "hi" : "en",
    timezone: pick("timezone", "Asia/Kolkata"),
    date_format: pick("date_format", "DD/MM/YYYY"),
    default_upi_id: pick("default_upi_id")
  };
}

function parseCustomFields(raw: unknown): CustomField[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({ label: String(item.label ?? ""), value: String(item.value ?? "") }));
  } catch {
    return [];
  }
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-2">{children}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CompanySettingsForm() {
  const { t, setLocale } = useI18n();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [orgId, setOrgId] = useState("");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const response = await fetch("/api/v1/settings/company");
      if (!response.ok) return null;
      const payload = (await response.json()) as { data?: Record<string, unknown> };
      return payload.data ?? null;
    }
  });

  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<CompanyValues>({ defaultValues: DEFAULTS });

  useEffect(() => {
    if (data) {
      reset(toFormValues(data));
      setOrgId(typeof data.id === "string" ? data.id : "");
      setCustomFields(parseCustomFields(data.custom_fields));
    }
  }, [data, reset]);

  const logoUrl = watch("logo_url");
  const usePaymentAddress = watch("use_payment_address");
  const baseCurrency = watch("base_currency");
  const country = watch("country");
  const stateValue = watch("state_code");

  const stateOptions = getStateOptions(country);
  const cityOptions = getCityOptions(country, stateValue);

  const handleLogo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast.error(t("company.logoType", "Unsupported file. Use jpg, jpeg, png, gif, or bmp."));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t("company.logoSize", "Logo must be 1MB or smaller."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setValue("logo_url", String(reader.result), { shouldDirty: true });
    reader.readAsDataURL(file);
  };

  const addCustomField = () => setCustomFields((current) => [...current, { label: "", value: "" }]);
  const updateCustomField = (index: number, patch: Partial<CustomField>) =>
    setCustomFields((current) => current.map((field, position) => (position === index ? { ...field, ...patch } : field)));
  const removeCustomField = (index: number) => setCustomFields((current) => current.filter((_, position) => position !== index));

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      ...values,
      custom_fields: JSON.stringify(customFields.filter((field) => field.label.trim() !== ""))
    };
    const response = await fetch("/api/v1/settings/company", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      toast.error(body?.error?.message ?? t("company.saveFailed", "Could not save company settings."));
      return;
    }
    toast.success(t("company.saved", "Company settings saved."));
    // Apply the chosen language immediately and let the currency/topbar refresh
    // so the new base currency + language take effect across the app at once.
    if (values.preferred_language === "en" || values.preferred_language === "hi") {
      setLocale(values.preferred_language);
    }
    queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    queryClient.invalidateQueries({ queryKey: ["company-summary"] });
  });

  if (isLoading) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ── Organization Profile ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> {t("company.profile", "Organization Profile")}
          </CardTitle>
          {orgId ? <CardDescription>ID: {orgId}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label>{t("company.logo", "Organization Logo")}</Label>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Organization logo" className="h-full w-full object-contain" />
                ) : (
                  <ImagePlus className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.gif,.bmp" className="hidden" onChange={handleLogo} />
                  <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                    <ImagePlus className="mr-2 h-4 w-4" />
                    {t("company.uploadLogo", "Upload logo")}
                  </Button>
                  {logoUrl ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setValue("logo_url", "", { shouldDirty: true })}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("common.remove", "Remove")}
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("company.logoHint", "Displayed in transaction PDFs and email notifications.")}
                  <br />
                  {t("company.logoDims", "Preferred dimensions: 240 × 240 px @ 72 DPI.")}
                  <br />
                  {t("company.logoFiles", "Supported: jpg, jpeg, png, gif, bmp. Max size: 1MB.")}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label={t("company.name", "Organization Name")} htmlFor="name">
              <Input id="name" {...register("name", { required: true })} />
              {formState.errors.name ? <p className="mt-1 text-xs text-destructive">Required.</p> : null}
            </Field>
            <Field label={t("company.industry", "Industry")} htmlFor="industry">
              <select id="industry" className={selectClass} {...register("industry")}>
                <option value="">{t("common.select", "Select…")}</option>
                {INDUSTRIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("company.location", "Organization Location")} htmlFor="country">
              <select
                id="country"
                className={selectClass}
                {...register("country", {
                  onChange: () => {
                    // Reset dependent fields when the country changes.
                    setValue("state_code", "", { shouldDirty: true });
                    setValue("city", "", { shouldDirty: true });
                  }
                })}
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* ── Address ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" /> {t("company.address", "Address")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label={t("company.addressLine", "Address")} htmlFor="address_line">
              <Input id="address_line" {...register("address_line")} />
            </Field>
            <Field label={t("company.street1", "Street 1")} htmlFor="street1">
              <Input id="street1" {...register("street1")} />
            </Field>
            <Field label={t("company.street2", "Street 2")} htmlFor="street2">
              <Input id="street2" {...register("street2")} />
            </Field>

            <Field
              label={t("company.state", "State")}
              htmlFor="state_code"
              hint={stateOptions.length === 0 ? t("company.stateFree", "No list for this country — type the state.") : undefined}
            >
              {stateOptions.length > 0 ? (
                <select id="state_code" className={selectClass} {...register("state_code", { onChange: () => setValue("city", "", { shouldDirty: true }) })}>
                  <option value="">{t("common.select", "Select…")}</option>
                  {stateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input id="state_code" placeholder={t("company.statePlaceholder", "Enter state")} {...register("state_code")} />
              )}
            </Field>

            <Field
              label={t("company.city", "City")}
              htmlFor="city"
              hint={cityOptions.length === 0 ? t("company.cityFree", "No list for this state — type the city.") : undefined}
            >
              {cityOptions.length > 0 ? (
                <select id="city" className={selectClass} {...register("city")}>
                  <option value="">{t("common.select", "Select…")}</option>
                  {cityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input id="city" placeholder={t("company.cityPlaceholder", "Enter city")} {...register("city")} />
              )}
            </Field>

            <Field label={t("company.pin", "Pin Code")} htmlFor="pin_code">
              <Input id="pin_code" {...register("pin_code")} />
            </Field>
            <Field label={t("company.phone", "Phone")} htmlFor="phone">
              <Input id="phone" {...register("phone")} />
            </Field>
            <Field label={t("company.fax", "Fax Number")} htmlFor="fax">
              <Input id="fax" {...register("fax")} />
            </Field>
            <Field label={t("company.website", "Website URL")} htmlFor="website">
              <Input id="website" type="url" placeholder="https://" {...register("website")} />
            </Field>
          </div>

          <Field
            label={t("company.addressFormat", "Organization Address Format")}
            htmlFor="address_format"
            hint={t("company.addressFormatHint", "Template used when printing the address on documents.")}
          >
            <Textarea id="address_format" rows={2} {...register("address_format")} />
          </Field>

          <div className="rounded-md border p-4">
            <Field label={t("company.paymentStubQ", "Would you like to add a different address for payment stubs?")} htmlFor="use_payment_address">
              <select
                id="use_payment_address"
                className={cn(selectClass, "max-w-[160px]")}
                value={usePaymentAddress ? "yes" : "no"}
                onChange={(event) => setValue("use_payment_address", event.target.value === "yes", { shouldDirty: true })}
              >
                <option value="no">{t("common.no", "No")}</option>
                <option value="yes">{t("common.yes", "Yes")}</option>
              </select>
            </Field>
            {usePaymentAddress ? (
              <div className="mt-4">
                <Field label={t("company.paymentAddress", "Payment stub address")} htmlFor="payment_address">
                  <Textarea id="payment_address" rows={3} {...register("payment_address")} />
                </Field>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* ── Primary Contact ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> {t("company.primaryContact", "Primary Contact")}
          </CardTitle>
          <CardDescription>{t("company.emailsSentThrough", "Emails are sent through this sender address.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <Field label={t("company.sender", "Sender / Primary Contact")} htmlFor="primary_contact_name">
            <Input id="primary_contact_name" {...register("primary_contact_name")} />
          </Field>
          <Field label={t("company.senderEmail", "Email address of sender")} htmlFor="sender_email">
            <Input id="sender_email" type="email" placeholder="name@company.com" {...register("sender_email")} />
          </Field>
        </CardContent>
      </Card>

      {/* ── Regional & Accounting Preferences ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="h-5 w-5" /> {t("company.preferences", "Regional & Accounting Preferences")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label={t("company.baseCurrency", "Base Currency")}>
              <CurrencySelect value={baseCurrency || "INR"} onChange={(value) => setValue("base_currency", value, { shouldDirty: true })} />
            </Field>
            <Field label={t("company.fiscalYear", "Fiscal Year")} htmlFor="fiscal_year_start">
              <select id="fiscal_year_start" className={selectClass} {...register("fiscal_year_start")}>
                {MONTHS.map((month, index) => (
                  <option key={month} value={String(index + 1)}>
                    {t("company.fyStarting", "Starting {month}", { month })}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">{t("company.reportBasis", "Report Basis")}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3", watch("report_basis") === "accrual" && "border-primary bg-primary/5")}>
                <input type="radio" value="accrual" className="mt-1 accent-sky-600" {...register("report_basis")} />
                <span>
                  <span className="block text-sm font-semibold">{t("company.accrual", "Accrual")}</span>
                  <span className="block text-xs text-muted-foreground">{t("company.accrualHint", "You owe tax as of the invoice date.")}</span>
                </span>
              </label>
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3", watch("report_basis") === "cash" && "border-primary bg-primary/5")}>
                <input type="radio" value="cash" className="mt-1 accent-sky-600" {...register("report_basis")} />
                <span>
                  <span className="block text-sm font-semibold">{t("company.cash", "Cash")}</span>
                  <span className="block text-xs text-muted-foreground">{t("company.cashHint", "You owe tax upon payment receipt.")}</span>
                </span>
              </label>
            </div>
          </fieldset>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label={t("company.orgLanguage", "Organization Language")} htmlFor="preferred_language">
              <select id="preferred_language" className={selectClass} {...register("preferred_language")}>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </Field>
            <Field label={t("company.commLanguages", "Communication Languages")} htmlFor="communication_language">
              <select id="communication_language" className={selectClass} {...register("communication_language")}>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </Field>
            <Field label={t("company.timezone", "Time Zone")} htmlFor="timezone">
              <select id="timezone" className={selectClass} {...register("timezone")}>
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("company.dateFormat", "Date Format")} htmlFor="date_format">
              <select id="date_format" className={selectClass} {...register("date_format")}>
                {DATE_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("company.upi", "Default UPI ID")} htmlFor="default_upi_id">
              <Input id="default_upi_id" {...register("default_upi_id")} />
            </Field>
            <Field label={t("company.companyId", "Company ID")} htmlFor="company_id">
              <Input id="company_id" value={orgId} readOnly disabled className="bg-muted/40" />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* ── Custom Fields ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListPlus className="h-5 w-5" /> {t("company.customFields", "Custom Fields")}
          </CardTitle>
          <CardDescription>{t("company.customFieldsHint", "Add your own organization fields as label / value pairs.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {customFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("company.noCustomFields", "No custom fields yet.")}</p>
          ) : (
            customFields.map((field, index) => (
              <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  aria-label={t("company.customLabel", "Field label")}
                  placeholder={t("company.customLabel", "Field label")}
                  value={field.label}
                  onChange={(event) => updateCustomField(index, { label: event.target.value })}
                  className="sm:max-w-[240px]"
                />
                <Input
                  aria-label={t("company.customValue", "Field value")}
                  placeholder={t("company.customValue", "Field value")}
                  value={field.value}
                  onChange={(event) => updateCustomField(index, { value: event.target.value })}
                />
                <Button type="button" variant="ghost" size="sm" aria-label={t("common.remove", "Remove")} onClick={() => removeCustomField(index)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
          <Button type="button" variant="secondary" size="sm" onClick={addCustomField}>
            <Plus className="mr-2 h-4 w-4" />
            {t("company.addCustomField", "Add custom field")}
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (data) {
              reset(toFormValues(data));
              setCustomFields(parseCustomFields(data.custom_fields));
            }
          }}
        >
          {t("common.reset", "Reset")}
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {t("common.saveChanges", "Save changes")}
        </Button>
      </div>
    </form>
  );
}
