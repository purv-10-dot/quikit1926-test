'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  GraduationCap,
  User,
  CreditCard,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TenantType = 'school' | 'corporate';

interface FormData {
  // Step 1 — Organization
  tenantType: TenantType;
  orgName: string;
  officialEmail: string;
  officialPhone: string;
  website: string;
  country: string;
  fullAddress: string;
  // Step 2 — Contact
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  email: string;
  roleInOrganization: string;
  // Step 3 — Billing
  billingFirstName: string;
  billingLastName: string;
  billingAddress: string;
  storageLimit: number;
}

type FieldErrors = Partial<Record<keyof FormData, string>>;

interface OnboardResponse {
  orgName?: string;
  subdomain?: string;
  name?: string;
  tenant?: { orgName?: string; subdomain?: string; name?: string };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COUNTRIES = [
  'India',
  'United States',
  'United Kingdom',
  'UAE',
  'Singapore',
  'Other',
];

const ROLES = [
  'Principal',
  'CEO',
  'HR Manager',
  'IT Admin',
  'Director',
  'Other',
];

const STEP_META = [
  {
    title: 'Organization Profile',
    subtitle: 'Tell us about the organization being onboarded.',
    icon: Building2,
  },
  {
    title: 'Contact Person',
    subtitle: 'Who is the primary point of contact?',
    icon: User,
  },
  {
    title: 'Billing & Quota',
    subtitle: 'Set billing details and storage allocation.',
    icon: CreditCard,
  },
  {
    title: 'Review & Create',
    subtitle: 'Confirm all details before creating the tenant.',
    icon: CheckCircle2,
  },
];

const TOTAL_STEPS = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHONE_RE = /^[\d\s\-\+\(\)]+$/;
const EMAIL_RE = /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i;
const URL_RE = /^https?:\/\/.+/;

function prepareWebsite(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (!URL_RE.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

// ---------------------------------------------------------------------------
// Field-level label helper
// ---------------------------------------------------------------------------

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-fg mb-1.5">
      {children}
      {required && <span className="ml-0.5 text-danger">*</span>}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-danger">
      {msg}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEP_META.map((s, i) => {
        const stepNum = i + 1;
        const active = stepNum === current;
        const done = stepNum < current;
        return (
          <div key={i} className="flex items-center gap-2">
            <div
              className="flex items-center justify-center rounded-full text-xs font-semibold transition-all duration-200"
              style={{
                width: active ? 32 : 24,
                height: active ? 32 : 24,
                background: active || done ? 'var(--brand-primary)' : 'rgb(var(--line-strong))',
                color: active || done ? '#fff' : 'rgb(var(--fg-muted))',
              }}
            >
              {done ? '✓' : stepNum}
            </div>
            {i < STEP_META.length - 1 && (
              <div
                className="h-px w-10"
                style={{
                  background: done ? 'var(--brand-primary)' : 'rgb(var(--line))',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review table row
// ---------------------------------------------------------------------------

function ReviewRow({ label, value }: { label: string; value: string | number }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-4 py-2.5 border-b border-line last:border-0">
      <span className="w-44 shrink-0 text-sm text-fg-muted">{label}</span>
      <span className="text-sm text-fg font-medium break-all">{String(value)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function TenantOnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [successData, setSuccessData] = useState<{ orgName: string; subdomain: string } | null>(null);

  const [form, setForm] = useState<FormData>({
    tenantType: 'corporate',
    orgName: '',
    officialEmail: '',
    officialPhone: '',
    website: '',
    country: '',
    fullAddress: '',
    firstName: '',
    middleName: '',
    lastName: '',
    phone: '',
    email: '',
    roleInOrganization: '',
    billingFirstName: '',
    billingLastName: '',
    billingAddress: '',
    storageLimit: 2,
  });

  // -------------------------------------------------------------------------
  // Field change
  // -------------------------------------------------------------------------

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleInput(key: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      set(key, e.target.value as FormData[typeof key]);
    };
  }

  // -------------------------------------------------------------------------
  // Validation per step
  // -------------------------------------------------------------------------

  function validateStep(s: number): FieldErrors {
    const e: FieldErrors = {};

    if (s === 1) {
      if (!form.orgName.trim()) e.orgName = 'Organization name is required';
      if (!form.officialEmail.trim()) {
        e.officialEmail = 'Official email is required';
      } else if (!EMAIL_RE.test(form.officialEmail)) {
        e.officialEmail = 'Please enter a valid email address';
      }
      if (!form.officialPhone.trim()) {
        e.officialPhone = 'Phone number is required';
      } else if (!PHONE_RE.test(form.officialPhone)) {
        e.officialPhone = 'Enter a valid phone number';
      }
      if (form.website.trim() && !URL_RE.test(prepareWebsite(form.website))) {
        e.website = 'Please enter a valid URL';
      }
      if (!form.country) e.country = 'Country is required';
      if (!form.fullAddress.trim()) e.fullAddress = 'Address is required';
    }

    if (s === 2) {
      if (!form.firstName.trim()) e.firstName = 'First name is required';
      if (!form.lastName.trim()) e.lastName = 'Last name is required';
      if (!form.phone.trim()) {
        e.phone = 'Phone number is required';
      } else if (!PHONE_RE.test(form.phone)) {
        e.phone = 'Enter a valid phone number';
      }
      if (!form.email.trim()) {
        e.email = 'Email is required';
      } else if (!EMAIL_RE.test(form.email)) {
        e.email = 'Please enter a valid email address';
      }
      if (!form.roleInOrganization) e.roleInOrganization = 'Role is required';
    }

    if (s === 3) {
      if (!form.billingFirstName.trim()) e.billingFirstName = 'Billing first name is required';
      if (!form.billingLastName.trim()) e.billingLastName = 'Billing last name is required';
      if (!form.billingAddress.trim()) e.billingAddress = 'Billing address is required';
      if (form.storageLimit < 1) e.storageLimit = 'Minimum 1 GB required';
      if (form.storageLimit > 1000) e.storageLimit = 'Maximum 1000 GB allowed';
    }

    return e;
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  function handleNext() {
    if (step < TOTAL_STEPS) {
      const e = validateStep(step);
      if (Object.keys(e).length > 0) {
        setErrors(e);
        return;
      }
      setErrors({});
      setStep((s) => s + 1);
    }
  }

  function handleBack() {
    if (step > 1) {
      setErrors({});
      setStep((s) => s - 1);
    }
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  async function handleSubmit() {
    const e = validateStep(3);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      setStep(3);
      return;
    }

    setSubmitting(true);
    setApiError('');

    const payload = {
      ...form,
      tenantType: form.tenantType || 'corporate',
      storageLimit: form.storageLimit || 2,
      website: prepareWebsite(form.website),
    };

    try {
      const res = await api.post<OnboardResponse>('/tenants/onboard', payload);
      const tenant = res?.tenant ?? res;
      setSuccessData({
        orgName: tenant?.orgName ?? tenant?.name ?? form.orgName,
        subdomain: tenant?.subdomain ?? '',
      });
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ??
        'Something went wrong. Please try again.';
      setApiError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Copy from primary contact
  // -------------------------------------------------------------------------

  function copyFromContact() {
    setForm((prev) => ({
      ...prev,
      billingFirstName: prev.firstName,
      billingLastName: prev.lastName,
      billingAddress: prev.fullAddress,
    }));
    setErrors((prev) => ({
      ...prev,
      billingFirstName: undefined,
      billingLastName: undefined,
      billingAddress: undefined,
    }));
  }

  // -------------------------------------------------------------------------
  // Success screen
  // -------------------------------------------------------------------------

  if (successData) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-10">
            <div
              className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: 'rgb(var(--success-soft))' }}
            >
              <CheckCircle2
                className="h-8 w-8"
                style={{ color: 'rgb(var(--success))' }}
              />
            </div>
            <h1 className="text-xl font-semibold text-fg mb-2">
              Tenant Created Successfully
            </h1>
            <p className="text-sm text-fg-muted mb-1">
              <span className="font-medium text-fg">{successData.orgName}</span> has
              been onboarded.
            </p>
            {successData.subdomain && (
              <p className="text-sm text-fg-muted mb-6">
                Subdomain:{' '}
                <span className="font-mono font-medium text-fg">
                  {successData.subdomain}
                </span>
              </p>
            )}
            <Button
              onClick={() => router.push('/tenants')}
              className="mt-4 w-full"
            >
              View Tenants
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Step meta
  // -------------------------------------------------------------------------

  const meta = STEP_META[step - 1];
  const StepIcon = meta.icon;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-fg">Tenant Onboarding</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Complete all steps to create a new tenant account.
          </p>
        </div>

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* Step card */}
        <Card>
          <CardContent className="pt-6">
            {/* Step heading */}
            <div className="flex items-center gap-3 mb-6">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'var(--brand-primary)' }}
              >
                <StepIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-fg">{meta.title}</h2>
                <p className="text-sm text-fg-muted">{meta.subtitle}</p>
              </div>
            </div>

            {/* Step content */}
            {step === 1 && (
              <Step1
                form={form}
                errors={errors}
                setTenantType={(v) => set('tenantType', v)}
                handleInput={handleInput}
                setField={set}
              />
            )}
            {step === 2 && (
              <Step2
                form={form}
                errors={errors}
                handleInput={handleInput}
              />
            )}
            {step === 3 && (
              <Step3
                form={form}
                errors={errors}
                handleInput={handleInput}
                setField={set}
                onCopyContact={copyFromContact}
              />
            )}
            {step === 4 && <Step4 form={form} />}

            {/* API error */}
            {apiError && (
              <div
                className="mt-4 rounded-lg border px-4 py-3 text-sm"
                style={{
                  background: 'rgb(var(--danger-soft))',
                  borderColor: 'rgb(var(--danger))',
                  color: 'rgb(var(--danger))',
                }}
              >
                {apiError}
              </div>
            )}
          </CardContent>

          {/* Footer nav */}
          <div className="flex items-center justify-between border-t border-line px-5 py-4">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            {step < TOTAL_STEPS ? (
              <Button onClick={handleNext}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} loading={submitting}>
                Create Tenant
                <CheckCircle2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Organization Profile
// ---------------------------------------------------------------------------

function Step1({
  form,
  errors,
  setTenantType,
  handleInput,
  setField,
}: {
  form: FormData;
  errors: FieldErrors;
  setTenantType: (v: TenantType) => void;
  handleInput: (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  setField: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Tenant type cards */}
      <div>
        <FieldLabel required>Organization Type</FieldLabel>
        <div className="grid grid-cols-2 gap-3 mt-1">
          {(
            [
              { value: 'school', label: 'School', icon: GraduationCap },
              { value: 'corporate', label: 'Corporate', icon: Building2 },
            ] as { value: TenantType; label: string; icon: React.ElementType }[]
          ).map(({ value, label, icon: Icon }) => {
            const active = form.tenantType === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTenantType(value)}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border p-5 text-sm font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  borderColor: active ? 'var(--brand-primary)' : 'rgb(var(--line-strong))',
                  background: active ? 'var(--brand-primary)' : 'rgb(var(--surface))',
                  color: active ? '#fff' : 'rgb(var(--fg))',
                }}
              >
                <Icon className="h-6 w-6" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <Input
        label="Organization Name"
        required
        placeholder="e.g. Acme Corp"
        value={form.orgName}
        onChange={handleInput('orgName')}
        error={errors.orgName}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Official Email"
          required
          type="email"
          placeholder="contact@example.com"
          value={form.officialEmail}
          onChange={handleInput('officialEmail')}
          error={errors.officialEmail}
        />
        <Input
          label="Official Phone"
          required
          type="tel"
          placeholder="+91 99999 99999"
          value={form.officialPhone}
          onChange={handleInput('officialPhone')}
          error={errors.officialPhone}
        />
      </div>

      <Input
        label="Website"
        type="url"
        placeholder="https://example.com"
        value={form.website}
        onChange={handleInput('website')}
        error={errors.website}
        hint="Optional — https:// will be added automatically if missing."
      />

      <div>
        <FieldLabel required>Country</FieldLabel>
        <select
          className="h-11 w-full rounded-md border bg-surface px-3 text-sm text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            borderColor: errors.country ? 'rgb(var(--danger))' : 'rgb(var(--line-strong))',
          }}
          value={form.country}
          onChange={handleInput('country')}
        >
          <option value="">Select a country</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <FieldError msg={errors.country} />
      </div>

      <div>
        <FieldLabel required>Full Address</FieldLabel>
        <textarea
          rows={3}
          className="w-full rounded-md border bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 resize-none"
          style={{
            borderColor: errors.fullAddress ? 'rgb(var(--danger))' : 'rgb(var(--line-strong))',
          }}
          placeholder="Street, City, State, ZIP"
          value={form.fullAddress}
          onChange={handleInput('fullAddress')}
        />
        <FieldError msg={errors.fullAddress} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Contact Person
// ---------------------------------------------------------------------------

function Step2({
  form,
  errors,
  handleInput,
}: {
  form: FormData;
  errors: FieldErrors;
  handleInput: (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          label="First Name"
          required
          placeholder="John"
          value={form.firstName}
          onChange={handleInput('firstName')}
          error={errors.firstName}
        />
        <Input
          label="Middle Name"
          placeholder="Michael"
          value={form.middleName}
          onChange={handleInput('middleName')}
        />
        <Input
          label="Last Name"
          required
          placeholder="Doe"
          value={form.lastName}
          onChange={handleInput('lastName')}
          error={errors.lastName}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Phone"
          required
          type="tel"
          placeholder="+91 99999 99999"
          value={form.phone}
          onChange={handleInput('phone')}
          error={errors.phone}
        />
        <Input
          label="Email"
          required
          type="email"
          placeholder="john@example.com"
          value={form.email}
          onChange={handleInput('email')}
          error={errors.email}
        />
      </div>

      <div>
        <FieldLabel required>Role in Organization</FieldLabel>
        <select
          className="h-11 w-full rounded-md border bg-surface px-3 text-sm text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            borderColor: errors.roleInOrganization ? 'rgb(var(--danger))' : 'rgb(var(--line-strong))',
          }}
          value={form.roleInOrganization}
          onChange={handleInput('roleInOrganization')}
        >
          <option value="">Select a role</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <FieldError msg={errors.roleInOrganization} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Billing & Quota
// ---------------------------------------------------------------------------

function Step3({
  form,
  errors,
  handleInput,
  setField,
  onCopyContact,
}: {
  form: FormData;
  errors: FieldErrors;
  handleInput: (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  setField: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  onCopyContact: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">Billing contact details</p>
        <button
          type="button"
          onClick={onCopyContact}
          className="text-xs font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
          style={{ color: 'var(--brand-primary)' }}
        >
          Copy from Primary Contact
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Billing First Name"
          required
          placeholder="John"
          value={form.billingFirstName}
          onChange={handleInput('billingFirstName')}
          error={errors.billingFirstName}
        />
        <Input
          label="Billing Last Name"
          required
          placeholder="Doe"
          value={form.billingLastName}
          onChange={handleInput('billingLastName')}
          error={errors.billingLastName}
        />
      </div>

      <div>
        <FieldLabel required>Billing Address</FieldLabel>
        <textarea
          rows={3}
          className="w-full rounded-md border bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-subtle transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 resize-none"
          style={{
            borderColor: errors.billingAddress ? 'rgb(var(--danger))' : 'rgb(var(--line-strong))',
          }}
          placeholder="Street, City, State, ZIP"
          value={form.billingAddress}
          onChange={handleInput('billingAddress')}
        />
        <FieldError msg={errors.billingAddress} />
      </div>

      <div>
        <FieldLabel>Storage Limit (GB)</FieldLabel>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={1000}
            className="h-11 w-36 rounded-md border bg-surface px-3 text-sm text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderColor: errors.storageLimit ? 'rgb(var(--danger))' : 'rgb(var(--line-strong))',
            }}
            value={form.storageLimit}
            onChange={(e) => setField('storageLimit', Number(e.target.value))}
          />
          <span className="text-sm text-fg-muted">GB (default: 2 GB, max: 1000 GB)</span>
        </div>
        <FieldError msg={errors.storageLimit} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Review
// ---------------------------------------------------------------------------

function Step4({ form }: { form: FormData }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">
          Organization
        </h3>
        <div className="rounded-lg border border-line divide-y divide-line overflow-hidden">
          <div className="px-4">
            <ReviewRow label="Type" value={form.tenantType === 'school' ? 'School' : 'Corporate'} />
            <ReviewRow label="Organization Name" value={form.orgName} />
            <ReviewRow label="Official Email" value={form.officialEmail} />
            <ReviewRow label="Official Phone" value={form.officialPhone} />
            <ReviewRow label="Website" value={form.website} />
            <ReviewRow label="Country" value={form.country} />
            <ReviewRow label="Address" value={form.fullAddress} />
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">
          Contact Person
        </h3>
        <div className="rounded-lg border border-line overflow-hidden">
          <div className="px-4">
            <ReviewRow
              label="Name"
              value={[form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ')}
            />
            <ReviewRow label="Phone" value={form.phone} />
            <ReviewRow label="Email" value={form.email} />
            <ReviewRow label="Role" value={form.roleInOrganization} />
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">
          Billing & Quota
        </h3>
        <div className="rounded-lg border border-line overflow-hidden">
          <div className="px-4">
            <ReviewRow
              label="Billing Name"
              value={[form.billingFirstName, form.billingLastName].filter(Boolean).join(' ')}
            />
            <ReviewRow label="Billing Address" value={form.billingAddress} />
            <ReviewRow label="Storage Limit" value={`${form.storageLimit} GB`} />
          </div>
        </div>
      </section>

      <p className="text-xs text-fg-muted text-center">
        Please verify all details above before creating the tenant. This action will provision the account.
      </p>
    </div>
  );
}
