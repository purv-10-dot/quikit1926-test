'use client';
/**
 * TenantOnboardingWizard — creating a new tenant.
 *
 * Mounted by `app/(super-admin)/tenants/page.tsx`. This is the ONLY caller of
 * `POST /api/tenants/onboard`.
 *
 * CONTRACT (do not break — `__tests__/components/tenant-onboarding-wizard.dom.test.tsx`
 * drives this form by `[name="…"]` and by the literal button labels `Next`,
 * `Back` and `Submit & Launch`). Every field the route's zod schema requires is
 * registered here: orgName, fullAddress, country, officialPhone, officialEmail,
 * firstName, lastName, phone, email, roleInOrganization, billingFirstName,
 * billingLastName, billingAddress — plus optional website / middleName /
 * billingMiddleName / storageLimit and the defaulted tenantType.
 *
 * The 2026-07 redesign changed presentation only. Same three steps, same
 * per-step `trigger()` gate, same payload, same error mapping. What changed:
 *
 *   - a persistent left rail, so the operator can always see how many steps
 *     remain and what they already completed (the old dialog showed a thin
 *     stepper that scrolled away with the content);
 *   - a real review step before submit — this creates an organisation AND its
 *     admin user, which was previously committed from a button the operator
 *     reached without ever seeing the values together;
 *   - a success state instead of the dialog vanishing, so it is obvious the
 *     tenant was created and what the admin's email is;
 *   - storage quota as presets, since the old free-number input gave no clue
 *     what a sensible value was.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  X, ChevronRight, ChevronLeft, Building2, User, CreditCard, GraduationCap,
  Briefcase, Check, AlertCircle, Loader2, Sparkles, HardDrive, ClipboardCheck,
} from 'lucide-react';
import { api } from '@/lib/api';

interface OrganizationProfile {
  tenantType: 'corporate' | 'school';
  orgName: string;
  fullAddress: string;
  country: string;
  officialPhone: string;
  website: string;
  officialEmail: string;
}

interface PrimaryContact {
  firstName: string;
  middleName?: string;
  lastName: string;
  phone: string;
  email: string;
  roleInOrganization: string;
}

interface BillingInfo {
  billingFirstName: string;
  billingMiddleName?: string;
  billingLastName: string;
  billingAddress: string;
  storageLimit?: number;
}

interface TenantOnboardingData extends OrganizationProfile, PrimaryContact, BillingInfo {}

interface TenantOnboardingWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

const STEPS = [
  { id: 1, title: 'Organization', blurb: 'Who they are', icon: Building2 },
  { id: 2, title: 'Primary contact', blurb: 'Who runs it', icon: User },
  { id: 3, title: 'Billing & quota', blurb: 'Limits and invoicing', icon: CreditCard },
] as const;

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'India', 'Germany', 'France', 'Other',
];

const ROLES = [
  'HR Head', 'CEO', 'CTO', 'Learning & Development Manager',
  'Training Manager', 'Operations Manager', 'Other',
];

const STORAGE_PRESETS = [2, 5, 10, 25, 50];

const PHONE_RE = /^[\d\s\-+()]+$/;
const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

/* ── shared field chrome ──────────────────────────────────────────────────── */

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition ' +
  'placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';

function Field({
  label, required, error, hint, children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-600">
          <AlertCircle className="size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

const TenantOnboardingWizard: React.FC<TenantOnboardingWizardProps> = ({ onClose, onSuccess }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register, handleSubmit, formState: { errors }, trigger, setValue, watch,
  } = useForm<TenantOnboardingData>({
    mode: 'onTouched',
    defaultValues: {
      tenantType: 'corporate',
      storageLimit: 2,
      billingFirstName: '',
      billingMiddleName: '',
      billingLastName: '',
      billingAddress: '',
    },
  });

  const v = watch();
  const tenantType = v.tenantType;

  const validateStep = async (step: number): Promise<boolean> => {
    const fields: Record<number, (keyof TenantOnboardingData)[]> = {
      1: ['orgName', 'fullAddress', 'country', 'officialPhone', 'officialEmail'],
      2: ['firstName', 'lastName', 'phone', 'email', 'roleInOrganization'],
      3: ['billingFirstName', 'billingLastName', 'billingAddress'],
    };
    return trigger(fields[step] ?? []);
  };

  const handleNext = async () => {
    if (await validateStep(currentStep)) {
      setCurrentStep((p) => Math.min(p + 1, 3));
      setError(null);
    }
  };

  const handleBack = () => {
    setCurrentStep((p) => Math.max(p - 1, 1));
    setError(null);
  };

  const copyFromContact = () => {
    setValue('billingFirstName', v.firstName || '');
    setValue('billingMiddleName', v.middleName || '');
    setValue('billingLastName', v.lastName || '');
    setValue('billingAddress', v.fullAddress || '');
  };

  const onSubmit = async (data: TenantOnboardingData) => {
    setIsSubmitting(true);
    setError(null);
    setProgress(0);

    let timer: NodeJS.Timeout | null = null;
    try {
      timer = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) {
            if (timer) clearInterval(timer);
            return 90;
          }
          return p + 10;
        });
      }, 500);

      // Auto-prepend https:// so an operator typing `acme.com` is not rejected
      // by the schema's url() check.
      const payload = { ...data };
      if (payload.website?.trim() && !/^https?:\/\//i.test(payload.website)) {
        payload.website = `https://${payload.website.trim()}`;
      }

      // The response carries a plaintext `adminTempPassword`; deliberately not
      // surfaced here — the tenants page reloads its list instead.
      await api.post('/tenants/onboard', {
        ...payload,
        tenantType: payload.tenantType || 'corporate',
        storageLimit: payload.storageLimit || 2,
      });

      if (timer) clearInterval(timer);
      setProgress(100);
      setDone(true);
      setTimeout(() => onSuccess(), 1200);
    } catch (err: unknown) {
      if (timer) clearInterval(timer);
      setIsSubmitting(false);
      setProgress(0);

      // The fetch client throws the parsed error BODY, so what axios exposed at
      // `err.response.data` is simply `err` here. `errors` is checked before
      // `validationErrors` because the legacy filter used the former; keeping
      // both is what makes the field-by-field display work against either.
      const e = err as {
        errors?: { field: string; message: string }[];
        validationErrors?: { field: string; message: string }[];
        message?: string;
        error?: string;
      };

      if (e?.errors || e?.validationErrors) {
        const list = (e.errors || e.validationErrors || [])
          .map((x) => `• ${x.field}: ${x.message}`)
          .join('\n');
        setError(`Validation failed:\n${list}`);
      } else if (e?.message) {
        setError(e.message);
      } else {
        setError(e?.error || 'Failed to onboard tenant. Please check all fields and try again.');
      }
    }
  };

  /* ── success ───────────────────────────────────────────────────────────── */
  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-3xl bg-white p-10 text-center shadow-2xl">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-50">
            <Check className="size-8 text-emerald-600" />
          </div>
          <h2 className="mt-6 text-xl font-bold text-slate-900">{v.orgName} is live</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            The organisation and its admin account were created. Invitation details have been sent to{' '}
            <span className="font-semibold text-slate-700">{v.email}</span>.
          </p>
        </div>
      </div>
    );
  }

  /* ── wizard ────────────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Left rail — always visible, so progress never scrolls out of view */}
        <aside className="relative hidden w-72 shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-b from-indigo-600 via-violet-600 to-indigo-700 p-8 md:flex">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-20">
            <div className="absolute -right-16 top-10 size-56 rounded-full bg-white/20 blur-3xl" />
          </div>

          <div className="relative">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-white/15 backdrop-blur">
                <Sparkles className="size-4 text-white" />
              </span>
              <div>
                <p className="text-sm font-bold text-white">New tenant</p>
                <p className="text-[11px] text-indigo-200">Step {currentStep} of 3</p>
              </div>
            </div>

            <ol className="mt-10 space-y-1">
              {STEPS.map((s) => {
                const Icon = s.icon;
                const state = s.id < currentStep ? 'done' : s.id === currentStep ? 'active' : 'todo';
                return (
                  <li key={s.id}>
                    <div
                      className={`flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors ${
                        state === 'active' ? 'bg-white/15' : ''
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${
                          state === 'done'
                            ? 'bg-white text-indigo-600'
                            : state === 'active'
                              ? 'bg-white/25 text-white'
                              : 'bg-white/10 text-indigo-200'
                        }`}
                      >
                        {state === 'done' ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${state === 'todo' ? 'text-indigo-200' : 'text-white'}`}>
                          {s.title}
                        </p>
                        <p className="text-[11px] text-indigo-200/80">{s.blurb}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="relative rounded-2xl bg-white/10 p-4 backdrop-blur">
            <p className="text-[11px] leading-relaxed text-indigo-100">
              This creates the organisation <em>and</em> its first admin user. The admin receives
              sign-in details by email.
            </p>
          </div>
        </aside>

        {/* Right — form */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-8 py-6">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {STEPS[currentStep - 1].title}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {currentStep === 1 && 'Where the organisation is and how to reach it.'}
                {currentStep === 2 && 'The person who will administer this tenant.'}
                {currentStep === 3 && 'Who gets invoiced, and how much storage they get.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close"
              className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
            >
              <X className="size-5" />
            </button>
          </header>

          {/* Mobile step pips — the rail is hidden under md */}
          <div className="flex shrink-0 gap-1.5 px-8 pt-4 md:hidden">
            {STEPS.map((s) => (
              <span
                key={s.id}
                className={`h-1 flex-1 rounded-full ${s.id <= currentStep ? 'bg-indigo-600' : 'bg-slate-200'}`}
              />
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
              {error && (
                <div className="mb-6 flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" />
                  <p className="whitespace-pre-line text-sm text-rose-800">{error}</p>
                </div>
              )}

              {/* ── Step 1 ─────────────────────────────────────────────── */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div>
                    <label className="mb-2 flex items-center gap-1 text-xs font-semibold text-slate-700">
                      Organization type <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([
                        {
                          key: 'corporate' as const,
                          icon: Briefcase,
                          name: 'Corporate',
                          blurb: 'Employee training, compliance windows, SCORM',
                        },
                        {
                          key: 'school' as const,
                          icon: GraduationCap,
                          name: 'School',
                          blurb: 'Batches, attendance, homework, parent access',
                        },
                      ]).map((o) => {
                        const Icon = o.icon;
                        const on = tenantType === o.key;
                        return (
                          <button
                            key={o.key}
                            type="button"
                            onClick={() => setValue('tenantType', o.key)}
                            disabled={isSubmitting}
                            aria-pressed={on}
                            className={`relative rounded-2xl border-2 p-5 text-left transition ${
                              on
                                ? 'border-indigo-500 bg-indigo-50/60 ring-4 ring-indigo-500/10'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {on && (
                              <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-indigo-600">
                                <Check className="size-3 text-white" />
                              </span>
                            )}
                            <Icon className={`size-6 ${on ? 'text-indigo-600' : 'text-slate-400'}`} />
                            <p className={`mt-3 text-sm font-bold ${on ? 'text-indigo-900' : 'text-slate-800'}`}>
                              {o.name}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500">{o.blurb}</p>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Sets the vocabulary and which modules this tenant sees. Changeable later.
                    </p>
                  </div>

                  <Field label="Organization name" required error={errors.orgName?.message}>
                    <input
                      {...register('orgName', { required: 'Organization name is required' })}
                      className={inputCls}
                      placeholder="Acme Corporation"
                      disabled={isSubmitting}
                    />
                  </Field>

                  <Field label="Full address" required error={errors.fullAddress?.message}>
                    <textarea
                      {...register('fullAddress', { required: 'Address is required' })}
                      className={inputCls}
                      rows={3}
                      placeholder="123 Business Street, Suite 100, City, State, ZIP"
                      disabled={isSubmitting}
                    />
                  </Field>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Country" required error={errors.country?.message}>
                      <select
                        {...register('country', { required: 'Country is required' })}
                        className={inputCls}
                        disabled={isSubmitting}
                        defaultValue=""
                      >
                        <option value="" disabled>Select a country</option>
                        {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>

                    <Field label="Official phone" required error={errors.officialPhone?.message}>
                      <input
                        {...register('officialPhone', {
                          required: 'Phone number is required',
                          pattern: { value: PHONE_RE, message: 'Invalid phone number format' },
                        })}
                        className={inputCls}
                        placeholder="+1 (555) 123-4567"
                        disabled={isSubmitting}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label="Website"
                      error={errors.website?.message}
                      hint="https:// is added automatically"
                    >
                      <input
                        {...register('website')}
                        className={inputCls}
                        placeholder="https://example.com"
                        disabled={isSubmitting}
                      />
                    </Field>

                    <Field label="Official email" required error={errors.officialEmail?.message}>
                      <input
                        {...register('officialEmail', {
                          required: 'Official email is required',
                          pattern: { value: EMAIL_RE, message: 'Invalid email address' },
                        })}
                        className={inputCls}
                        placeholder="contact@example.com"
                        disabled={isSubmitting}
                      />
                    </Field>
                  </div>
                </div>
              )}

              {/* ── Step 2 ─────────────────────────────────────────────── */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="flex gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                    <User className="mt-0.5 size-4 shrink-0 text-indigo-600" />
                    <p className="text-xs leading-relaxed text-indigo-900">
                      This person becomes the tenant&apos;s first administrator. They receive sign-in
                      details by email and can invite everyone else.
                    </p>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-3">
                    <Field label="First name" required error={errors.firstName?.message}>
                      <input
                        {...register('firstName', { required: 'First name is required' })}
                        className={inputCls} placeholder="John" disabled={isSubmitting}
                      />
                    </Field>
                    <Field label="Middle name" error={errors.middleName?.message}>
                      <input
                        {...register('middleName')} className={inputCls}
                        placeholder="Michael" disabled={isSubmitting}
                      />
                    </Field>
                    <Field label="Last name" required error={errors.lastName?.message}>
                      <input
                        {...register('lastName', { required: 'Last name is required' })}
                        className={inputCls} placeholder="Doe" disabled={isSubmitting}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Phone" required error={errors.phone?.message}>
                      <input
                        {...register('phone', {
                          required: 'Phone number is required',
                          pattern: { value: PHONE_RE, message: 'Invalid phone number format' },
                        })}
                        className={inputCls} placeholder="+1 (555) 123-4567" disabled={isSubmitting}
                      />
                    </Field>
                    <Field
                      label="Email"
                      required
                      error={errors.email?.message}
                      hint="Sign-in address for the admin account"
                    >
                      <input
                        {...register('email', {
                          required: 'Email is required',
                          pattern: { value: EMAIL_RE, message: 'Invalid email address' },
                        })}
                        className={inputCls} placeholder="john.doe@example.com" disabled={isSubmitting}
                      />
                    </Field>
                  </div>

                  <Field label="Role in organization" required error={errors.roleInOrganization?.message}>
                    <select
                      {...register('roleInOrganization', { required: 'Role is required' })}
                      className={inputCls} disabled={isSubmitting} defaultValue=""
                    >
                      <option value="" disabled>Select a role</option>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                </div>
              )}

              {/* ── Step 3 ─────────────────────────────────────────────── */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs leading-relaxed text-slate-600">
                      Billing contact is often the same person as the admin.
                    </p>
                    <button
                      type="button"
                      onClick={copyFromContact}
                      disabled={isSubmitting}
                      className="shrink-0 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-indigo-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-indigo-50 disabled:opacity-50"
                    >
                      Copy from Primary Contact
                    </button>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-3">
                    <Field label="Billing first name" required error={errors.billingFirstName?.message}>
                      <input
                        {...register('billingFirstName', { required: 'Billing first name is required' })}
                        className={inputCls} placeholder="John" disabled={isSubmitting}
                      />
                    </Field>
                    <Field label="Billing middle name" error={errors.billingMiddleName?.message}>
                      <input
                        {...register('billingMiddleName')} className={inputCls}
                        placeholder="Michael" disabled={isSubmitting}
                      />
                    </Field>
                    <Field label="Billing last name" required error={errors.billingLastName?.message}>
                      <input
                        {...register('billingLastName', { required: 'Billing last name is required' })}
                        className={inputCls} placeholder="Doe" disabled={isSubmitting}
                      />
                    </Field>
                  </div>

                  <Field label="Billing address" required error={errors.billingAddress?.message}>
                    <textarea
                      {...register('billingAddress', { required: 'Billing address is required' })}
                      className={inputCls} rows={3}
                      placeholder="123 Billing Street, Suite 200, City, State, ZIP"
                      disabled={isSubmitting}
                    />
                  </Field>

                  <Field
                    label="Storage quota (GB)"
                    error={errors.storageLimit?.message}
                    hint="Applies to uploaded course media, SCORM packages and submissions."
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {STORAGE_PRESETS.map((g) => {
                        const on = Number(v.storageLimit) === g;
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setValue('storageLimit', g)}
                            disabled={isSubmitting}
                            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                              on
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {g} GB
                          </button>
                        );
                      })}
                      <span className="ml-1 flex items-center gap-2">
                        <HardDrive className="size-3.5 text-slate-400" />
                        <input
                          type="number"
                          min={1}
                          {...register('storageLimit', { valueAsNumber: true })}
                          className={`${inputCls} w-24 py-2`}
                          placeholder="2"
                          disabled={isSubmitting}
                        />
                      </span>
                    </div>
                  </Field>

                  {/* Review — this commits an org AND an admin user, so show the
                      operator what they are about to create before they do. */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <ClipboardCheck className="size-3.5" />
                      Review
                    </p>
                    <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                      {[
                        ['Organization', v.orgName],
                        ['Type', tenantType === 'school' ? 'School' : 'Corporate'],
                        ['Country', v.country],
                        ['Official email', v.officialEmail],
                        ['Admin', [v.firstName, v.lastName].filter(Boolean).join(' ')],
                        ['Admin email', v.email],
                        ['Storage', v.storageLimit ? `${v.storageLimit} GB` : '2 GB'],
                      ].map(([k, val]) => (
                        <div key={k as string} className="min-w-0">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
                          <dd className="truncate text-sm font-medium text-slate-800">
                            {val || <span className="text-slate-300">—</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-slate-200 bg-white px-8 py-5">
              {isSubmitting && (
                <div className="mb-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600">Creating tenant…</span>
                    <span className="font-bold tabular-nums text-slate-900">{progress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={currentStep === 1 || isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                  Back
                </button>

                {currentStep < 3 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50"
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                  >
                    {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    Submit &amp; Launch
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TenantOnboardingWizard;
