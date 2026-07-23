"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  fullApplicationSchema,
  type ApplicationPayload,
} from "@/lib/schemas/applicationSchema";
import { cn } from "@/lib/utils";

type Vertical = { slug: string; name: string };

type FormState = Partial<ApplicationPayload>;

const STEPS = [
  { id: 1, label: "Company" },
  { id: 2, label: "Funding" },
  { id: 3, label: "Financials" },
  { id: 4, label: "Documents" },
  { id: 5, label: "Review" },
];

export default function ApplicationWizard({ verticals }: { verticals: Vertical[] }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
    if (errors[k as string]) {
      setErrors((prev) => {
        const { [k as string]: _, ...rest } = prev;
        return rest;
      });
    }
  }

  function validateStep(n: number): boolean {
    const validators: Record<number, () => Record<string, string> | null> = {
      1: () => {
        const r = step1Schema.safeParse(form);
        if (r.success) return null;
        return Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
      },
      2: () => {
        const r = step2Schema.safeParse(form);
        if (r.success) return null;
        return Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
      },
      3: () => {
        const r = step3Schema.safeParse(form);
        if (r.success) return null;
        return Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
      },
    };
    const fn = validators[n];
    if (!fn) return true; // step 4 (Documents) and step 5 (Review) don't gate
    const errs = fn();
    if (errs) {
      setErrors(errs);
      return false;
    }
    setErrors({});
    return true;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(5, s + 1));
  }

  function prev() {
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleSubmit() {
    setSubmitError(null);
    const r = fullApplicationSchema.safeParse(form);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message])));
      // jump to first invalid step
      const path = r.error.issues[0]?.path.join(".") ?? "";
      if (["startupName", "contactName", "contactEmail", "verticalSlug", "description"].some((k) => path.startsWith(k))) {
        setStep(1);
      } else if (["fundingAskLakhs", "loanType", "purpose", "tenureMonths"].some((k) => path.startsWith(k))) {
        setStep(2);
      } else {
        setStep(3);
      }
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(r.data),
      });
      const j = await res.json();
      if (!j.success) {
        setSubmitError(j.error ?? "Submission failed");
        return;
      }
      // Successful — go to founder dashboard
      router.push("/dashboard");
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <ol className="flex items-center gap-2 mb-2">
        {STEPS.map((s) => (
          <li
            key={s.id}
            className={cn(
              "flex-1 text-center px-3 py-2 rounded-lg text-xs font-medium border",
              step === s.id
                ? "bg-blue-600 text-white border-blue-600"
                : step > s.id
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-white text-gray-500 border-gray-200",
            )}
          >
            {s.id}. {s.label}
          </li>
        ))}
      </ol>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          step === 5 ? handleSubmit() : next();
        }}
        className="bg-white border border-gray-200 rounded-xl p-5 space-y-5"
      >
        {step === 1 && <Step1 form={form} set={set} errors={errors} verticals={verticals} />}
        {step === 2 && <Step2 form={form} set={set} errors={errors} />}
        {step === 3 && <Step3 form={form} set={set} errors={errors} />}
        {step === 4 && <Step4 />}
        {step === 5 && <Step5 form={form} verticals={verticals} />}

        {submitError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {submitError}
          </div>
        )}

        <div className="flex justify-between pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={prev}
            disabled={step === 1 || submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg disabled:opacity-50"
          >
            {step === 5 ? (submitting ? "Submitting…" : "Submit application") : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─── Step components ───────────────────────────────────────────────────── */

interface StepProps {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  errors: Record<string, string>;
}

function Step1({ form, set, errors, verticals }: StepProps & { verticals: Vertical[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Company info</h2>
      <Field label="Startup name" error={errors.startupName} required>
        <input className={inp} value={form.startupName ?? ""} onChange={(e) => set("startupName", e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Contact name" error={errors.contactName} required>
          <input className={inp} value={form.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} />
        </Field>
        <Field label="Contact email" error={errors.contactEmail} required>
          <input type="email" className={inp} value={form.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} />
        </Field>
        <Field label="Phone" error={errors.contactPhone}>
          <input className={inp} value={form.contactPhone ?? ""} onChange={(e) => set("contactPhone", e.target.value)} />
        </Field>
        <Field label="Website" error={errors.website}>
          <input className={inp} placeholder="https://" value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} />
        </Field>
      </div>
      <Field label="Vertical" error={errors.verticalSlug} required>
        <select className={inp} value={form.verticalSlug ?? ""} onChange={(e) => set("verticalSlug", e.target.value)}>
          <option value="">Select…</option>
          {verticals.map((v) => (
            <option key={v.slug} value={v.slug}>{v.name}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Founded year" error={errors.foundedYear}>
          <input type="number" className={inp} value={form.foundedYear ?? ""} onChange={(e) => set("foundedYear", e.target.value === "" ? undefined : Number(e.target.value))} />
        </Field>
        <Field label="Team size" error={errors.teamSize}>
          <input type="number" className={inp} value={form.teamSize ?? ""} onChange={(e) => set("teamSize", e.target.value === "" ? undefined : Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Business description" error={errors.description} required>
        <textarea
          rows={4}
          className={inp}
          placeholder="What does your startup do? Who are your users? At least 20 characters."
          value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
    </div>
  );
}

function Step2({ form, set, errors }: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Funding request</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Funding ask (₹ lakhs)" error={errors.fundingAskLakhs} required>
          <input type="number" className={inp} value={form.fundingAskLakhs ?? ""} onChange={(e) => set("fundingAskLakhs", e.target.value === "" ? undefined : Number(e.target.value))} />
        </Field>
        <Field label="Instrument type" error={errors.loanType} required>
          <select className={inp} value={form.loanType ?? ""} onChange={(e) => set("loanType", e.target.value as "term-loan" | "rbf" | "equity")}>
            <option value="">Select…</option>
            <option value="term-loan">Term loan</option>
            <option value="rbf">Revenue-based financing (RBF)</option>
            <option value="equity">Equity</option>
          </select>
        </Field>
      </div>
      {form.loanType !== "equity" && (
        <Field label="Tenure (months)" error={errors.tenureMonths}>
          <input type="number" className={inp} value={form.tenureMonths ?? ""} onChange={(e) => set("tenureMonths", e.target.value === "" ? undefined : Number(e.target.value))} />
        </Field>
      )}
      <Field label="Purpose of funds" error={errors.purpose} required>
        <textarea
          rows={3}
          className={inp}
          placeholder="What will the funds be used for?"
          value={form.purpose ?? ""}
          onChange={(e) => set("purpose", e.target.value)}
        />
      </Field>
    </div>
  );
}

function Step3({ form, set, errors }: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Financials</h2>
      <p className="text-xs text-gray-500 -mt-2">All amounts in ₹ lakhs. Optional but helps the analyst review faster.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Monthly revenue" error={errors.monthlyRevenueLakhs}>
          <input type="number" step="0.01" className={inp} value={form.monthlyRevenueLakhs ?? ""} onChange={(e) => set("monthlyRevenueLakhs", e.target.value === "" ? undefined : Number(e.target.value))} />
        </Field>
        <Field label="EBITDA (monthly)" error={errors.ebitdaLakhs}>
          <input type="number" step="0.01" className={inp} value={form.ebitdaLakhs ?? ""} onChange={(e) => set("ebitdaLakhs", e.target.value === "" ? undefined : Number(e.target.value))} />
        </Field>
        <Field label="Existing debt" error={errors.existingDebtLakhs}>
          <input type="number" step="0.01" className={inp} value={form.existingDebtLakhs ?? ""} onChange={(e) => set("existingDebtLakhs", e.target.value === "" ? undefined : Number(e.target.value))} />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="GST number" error={errors.gstNumber}>
          <input className={inp} value={form.gstNumber ?? ""} onChange={(e) => set("gstNumber", e.target.value)} />
        </Field>
        <Field label="Bank account (last 4 digits)" error={errors.bankAccountLast4}>
          <input className={inp} value={form.bankAccountLast4 ?? ""} onChange={(e) => set("bankAccountLast4", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

function Step4() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
      <p className="text-sm text-gray-600">
        After submission, you&apos;ll be able to upload supporting documents at{" "}
        <span className="font-mono text-xs">/documents</span>:
      </p>
      <ul className="list-disc list-inside text-sm text-gray-600 ml-2 space-y-1">
        <li>Pitch deck</li>
        <li>Audited financials</li>
        <li>Incorporation certificate</li>
        <li>GST returns (last 3 years)</li>
        <li>Bank statements (last 12 months)</li>
      </ul>
      <p className="text-xs text-gray-400 mt-3">
        You can re-upload at any time — the VC team sees status updates in real time.
      </p>
    </div>
  );
}

function Step5({ form, verticals }: { form: FormState; verticals: Vertical[] }) {
  const verticalName = verticals.find((v) => v.slug === form.verticalSlug)?.name ?? "—";
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">Review &amp; submit</h2>
      <dl className="text-sm text-gray-700 grid grid-cols-2 gap-x-6 gap-y-2">
        <Row label="Startup">{form.startupName ?? "—"}</Row>
        <Row label="Contact">{form.contactName ?? "—"}</Row>
        <Row label="Email">{form.contactEmail ?? "—"}</Row>
        <Row label="Phone">{form.contactPhone || "—"}</Row>
        <Row label="Website">{form.website || "—"}</Row>
        <Row label="Vertical">{verticalName}</Row>
        <Row label="Founded">{form.foundedYear ?? "—"}</Row>
        <Row label="Team size">{form.teamSize ?? "—"}</Row>
        <Row label="Funding ask">₹{form.fundingAskLakhs ?? "—"} L</Row>
        <Row label="Instrument">{form.loanType ?? "—"}</Row>
        <Row label="Tenure">{form.tenureMonths ?? "—"} months</Row>
        <Row label="Monthly revenue">₹{form.monthlyRevenueLakhs ?? "—"} L</Row>
      </dl>
      <p className="text-xs text-gray-400 pt-3 border-t border-gray-100">
        On submit, your application enters the VC firm&apos;s pipeline at the
        Intake stage. You&apos;ll be notified at each stage transition.
      </p>
    </div>
  );
}

/* ─── Tiny field primitives ─────────────────────────────────────────────── */

const inp =
  "w-full border border-gray-200 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400";

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700 mb-1 block">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {error && <span className="text-xs text-red-600 mt-1 block">{error}</span>}
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </>
  );
}
